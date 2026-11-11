import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { db, avecEntreprise, type TransactionDrizzle } from "@/db/client";
import { demandeConge, dossierRH, entreprise, evaluation, modificationFichePartagee, service, stagiaireAcademique, utilisateur } from "@/db/schema";
import { m } from "@/lib/i18n/catalogue";
import { peut } from "@/lib/permissions";
import type { UtilisateurConnecte } from "@/lib/session";
import { champsChanges, validerChampsFiche, type TypeCible } from "@/lib/rh/fiches-ouvertes-regles";

/**
 * Fiches OUVERTES aux entreprises d'un groupe (2026-11-11) : l'Administrateur d'une entreprise autorise, partenaire par partenaire, les
 * Administrateurs et Managers RH d'une autre entreprise DU MÊME GROUPE à consulter ET modifier les informations de ses fiches (collaborateurs
 * et stagiaires). Exception volontaire à l'isolation entre entreprises, strictement bornée :
 *  - l'autorisation vient de la base (`entreprise.fichesOuvertesA` du PROPRIÉTAIRE, même groupe aujourd'hui), jamais du navigateur ;
 *  - la RLS reste par entreprise : on rouvre une transaction DANS l'entreprise propriétaire (`avecEntreprise`) avec un identifiant que ce module
 *    a lui-même vérifié, et chaque ligne est relue avec le filtre explicite de cette entreprise ;
 *  - lecture ET écriture par liste blanche, champ par champ : jamais le salaire, les primes, les bulletins, les fichiers RH, l'indemnité d'un
 *    stagiaire, le responsable, le rôle ni le statut ;
 *  - chaque modification est tracée côté propriétaire (qui, quelle entreprise, quels champs).
 */
export type EntreprisePartenaire = { id: string; nom: string };

/** Lecture : Administrateur ou Manager avec accès RH. Jamais un Employé. */
export function peutVoirFichesOuvertes(u: UtilisateurConnecte): boolean {
  return (u.role === "ADMIN" || u.role === "MANAGER") && peut(u, "RH", "VOIR");
}

/** Modification : en plus, le droit RH/MODIFIER (un Manager qui n'a que VOIR consulte sans modifier). */
export function peutModifierFichesOuvertes(u: UtilisateurConnecte): boolean {
  return peutVoirFichesOuvertes(u) && peut(u, "RH", "MODIFIER");
}

/** Entreprises du groupe qui ont ouvert leurs fiches à `entrepriseId`. `entreprise` n'a pas de RLS. */
export async function proprietairesOuvertsAMoi(entrepriseId: string): Promise<EntreprisePartenaire[]> {
  const [moi] = await db.select({ groupeId: entreprise.groupeId }).from(entreprise).where(eq(entreprise.id, entrepriseId));
  if (!moi?.groupeId) return [];
  const autres = await db.select({ id: entreprise.id, nom: entreprise.nom, ouvertes: entreprise.fichesOuvertesA }).from(entreprise).where(and(eq(entreprise.groupeId, moi.groupeId), ne(entreprise.id, entrepriseId))).orderBy(entreprise.nom);
  return autres.filter((a) => a.ouvertes.includes(entrepriseId)).map((a) => ({ id: a.id, nom: a.nom }));
}

/** `ownerId` (venu de l'adresse) est-il bien une entreprise qui m'a ouvert ses fiches ? Renvoie son nom, sinon null. */
async function proprietaireAutorise(u: UtilisateurConnecte, ownerId: string): Promise<EntreprisePartenaire | null> {
  if (ownerId === u.entrepriseId) return null;
  return (await proprietairesOuvertsAMoi(u.entrepriseId)).find((p) => p.id === ownerId) ?? null;
}

export type EtatOuverture = { groupe: boolean; partenaires: { id: string; nom: string; ouvertAuPartenaire: boolean; ouvertAMoi: boolean }[] };

/** Pour l'écran de l'Administrateur : pour chaque autre entreprise du groupe, lui ai-je ouvert mes fiches, et m'a-t-elle ouvert les siennes ? */
export async function etatOuvertureFiches(entrepriseId: string): Promise<EtatOuverture> {
  const [moi] = await db.select({ groupeId: entreprise.groupeId, ouvertes: entreprise.fichesOuvertesA }).from(entreprise).where(eq(entreprise.id, entrepriseId));
  if (!moi?.groupeId) return { groupe: false, partenaires: [] };
  const autres = await db.select({ id: entreprise.id, nom: entreprise.nom, ouvertes: entreprise.fichesOuvertesA }).from(entreprise).where(and(eq(entreprise.groupeId, moi.groupeId), ne(entreprise.id, entrepriseId))).orderBy(entreprise.nom);
  return { groupe: true, partenaires: autres.map((a) => ({ id: a.id, nom: a.nom, ouvertAuPartenaire: moi.ouvertes.includes(a.id), ouvertAMoi: a.ouvertes.includes(entrepriseId) })) };
}

/** Ouvre ou ferme mes fiches à une entreprise du MÊME groupe (Administrateur, vérifié par l'appelant). Renvoie false si ce n'est pas une entreprise du groupe. */
export async function definirOuvertureFiches(entrepriseId: string, partenaireId: string, actif: boolean): Promise<boolean> {
  const etat = await etatOuvertureFiches(entrepriseId);
  if (!etat.partenaires.some((p) => p.id === partenaireId)) return false;
  const [moi] = await db.select({ ouvertes: entreprise.fichesOuvertesA }).from(entreprise).where(eq(entreprise.id, entrepriseId));
  const sans = (moi?.ouvertes ?? []).filter((x) => x !== partenaireId);
  await db.update(entreprise).set({ fichesOuvertesA: actif ? [...sans, partenaireId] : sans }).where(eq(entreprise.id, entrepriseId));
  return true;
}

export type PersonneOuverte = { type: TypeCible; id: string; nom: string; detail: string; photoCle: string | null };

/** Liste des personnes (collaborateurs actifs et stagiaires) des entreprises qui m'ont ouvert leurs fiches : nom et ligne de détail seulement. */
export async function listerFichesOuvertes(u: UtilisateurConnecte): Promise<{ entreprise: EntreprisePartenaire; personnes: PersonneOuverte[] }[]> {
  if (!peutVoirFichesOuvertes(u)) return [];
  const resultat: { entreprise: EntreprisePartenaire; personnes: PersonneOuverte[] }[] = [];
  for (const p of await proprietairesOuvertsAMoi(u.entrepriseId)) {
    const personnes = await avecEntreprise(p.id, async (tx) => {
      const gens = await tx
        .select({ id: utilisateur.id, nom: utilisateur.nomComplet, photoCle: utilisateur.photoCleStockage, poste: dossierRH.poste })
        .from(dossierRH)
        .innerJoin(utilisateur, eq(dossierRH.utilisateurId, utilisateur.id))
        .where(and(eq(dossierRH.entrepriseId, p.id), eq(utilisateur.entrepriseId, p.id), eq(utilisateur.statut, "ACTIF")))
        .orderBy(utilisateur.nomComplet);
      const stagiaires = await tx
        .select({ id: stagiaireAcademique.id, nom: stagiaireAcademique.nom, etablissement: stagiaireAcademique.etablissement })
        .from(stagiaireAcademique)
        .where(and(eq(stagiaireAcademique.entrepriseId, p.id), eq(stagiaireAcademique.statut, "EN_COURS")))
        .orderBy(stagiaireAcademique.nom);
      return [
        ...gens.map((g): PersonneOuverte => ({ type: "UTILISATEUR", id: g.id, nom: g.nom, detail: g.poste, photoCle: g.photoCle })),
        ...stagiaires.map((s): PersonneOuverte => ({ type: "STAGIAIRE", id: s.id, nom: s.nom, detail: s.etablissement, photoCle: null })),
      ];
    });
    resultat.push({ entreprise: p, personnes });
  }
  return resultat;
}

export type FicheOuverte = {
  type: TypeCible;
  id: string;
  entrepriseNom: string;
  nom: string;
  photoCle: string | null;
  role: string | null;
  departement: string | null;
  dateEmbauche: Date | null;
  dateDebut: Date | null;
  dateFin: Date | null;
  statut: string | null;
  soldeConges: number | null;
  /** Valeurs actuelles des champs modifiables (clé → texte ou null). */
  valeurs: Record<string, string | null>;
  conges: { id: string; type: string; dateDebut: Date; dateFin: Date; nombreJours: number; statut: string }[];
  evaluations: { id: string; periode: string; commentaire: string | null; evaluateurNom: string; creeLe: Date }[];
};

const jour = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

/**
 * Lit une fiche ouverte. Liste blanche : jamais salaire, primes, bulletins, fichiers RH, indemnité, motif d'un congé (donnée de santé),
 * responsable. `null` si le propriétaire ne m'a pas ouvert ses fiches OU si la personne n'est pas de cette entreprise (même réponse).
 */
export async function lireFicheOuverte(u: UtilisateurConnecte, ownerId: string, type: TypeCible, id: string): Promise<FicheOuverte | null> {
  if (!peutVoirFichesOuvertes(u)) return null;
  const proprietaire = await proprietaireAutorise(u, ownerId);
  if (!proprietaire) return null;

  return avecEntreprise(ownerId, async (tx): Promise<FicheOuverte | null> => {
    if (type === "STAGIAIRE") {
      const [s] = await tx
        .select({
          id: stagiaireAcademique.id, nom: stagiaireAcademique.nom, etablissement: stagiaireAcademique.etablissement, filiere: stagiaireAcademique.filiere, niveau: stagiaireAcademique.niveau,
          telephone: stagiaireAcademique.telephone, email: stagiaireAcademique.email, tuteurEcoleNom: stagiaireAcademique.tuteurEcoleNom, tuteurEcoleContact: stagiaireAcademique.tuteurEcoleContact,
          mission: stagiaireAcademique.mission, dateNaissance: stagiaireAcademique.dateNaissance, dateDebut: stagiaireAcademique.dateDebut, dateFin: stagiaireAcademique.dateFin,
          statut: stagiaireAcademique.statut, departement: service.nom,
        })
        .from(stagiaireAcademique)
        .leftJoin(service, eq(stagiaireAcademique.serviceId, service.id))
        .where(and(eq(stagiaireAcademique.id, id), eq(stagiaireAcademique.entrepriseId, ownerId)));
      if (!s) return null;
      return {
        type, id: s.id, entrepriseNom: proprietaire.nom, nom: s.nom, photoCle: null, role: null, departement: s.departement, dateEmbauche: null, dateDebut: s.dateDebut, dateFin: s.dateFin, statut: s.statut, soldeConges: null,
        valeurs: { etablissement: s.etablissement, filiere: s.filiere, niveau: s.niveau, telephone: s.telephone, email: s.email, tuteurEcoleNom: s.tuteurEcoleNom, tuteurEcoleContact: s.tuteurEcoleContact, mission: s.mission, dateNaissance: s.dateNaissance },
        conges: [], evaluations: [],
      };
    }

    // `utilisateur` est en RLS permissive : le filtre sur l'entreprise propriétaire est explicite.
    const [l] = await tx
      .select({
        dossierId: dossierRH.id, nom: utilisateur.nomComplet, photoCle: utilisateur.photoCleStockage, role: utilisateur.role, departement: service.nom,
        poste: dossierRH.poste, typeContrat: dossierRH.typeContrat, dateEmbauche: dossierRH.dateEmbauche, dateFinContrat: dossierRH.dateFinContrat, telephone: dossierRH.telephone,
        adresse: dossierRH.adresse, urgenceNom: dossierRH.urgenceNom, urgenceTelephone: dossierRH.urgenceTelephone, dateNaissance: dossierRH.dateNaissance, soldeConges: dossierRH.soldeConges,
      })
      .from(dossierRH)
      .innerJoin(utilisateur, eq(dossierRH.utilisateurId, utilisateur.id))
      .leftJoin(service, eq(utilisateur.serviceId, service.id))
      .where(and(eq(utilisateur.id, id), eq(dossierRH.entrepriseId, ownerId), eq(utilisateur.entrepriseId, ownerId), ne(utilisateur.statut, "SUPPRIME")));
    if (!l) return null;

    // Congés : dates, durée et statut seulement — jamais le motif (donnée de santé pour un congé maladie).
    const conges = await tx
      .select({ id: demandeConge.id, type: demandeConge.type, dateDebut: demandeConge.dateDebut, dateFin: demandeConge.dateFin, nombreJours: demandeConge.nombreJours, statut: demandeConge.statut })
      .from(demandeConge)
      .where(and(eq(demandeConge.dossierRHId, l.dossierId), eq(demandeConge.entrepriseId, ownerId)))
      .orderBy(desc(demandeConge.dateDebut))
      .limit(30);
    const evaluations = await tx
      .select({ id: evaluation.id, periode: evaluation.periode, commentaire: evaluation.commentaire, evaluateurNom: utilisateur.nomComplet, creeLe: evaluation.creeLe })
      .from(evaluation)
      .innerJoin(utilisateur, eq(evaluation.evaluateurId, utilisateur.id))
      .where(and(eq(evaluation.dossierRHId, l.dossierId), eq(evaluation.entrepriseId, ownerId)))
      .orderBy(desc(evaluation.creeLe))
      .limit(30);

    return {
      type, id, entrepriseNom: proprietaire.nom, nom: l.nom, photoCle: l.photoCle, role: l.role, departement: l.departement, dateEmbauche: l.dateEmbauche, dateDebut: null, dateFin: null, statut: null, soldeConges: l.soldeConges,
      valeurs: { poste: l.poste, typeContrat: l.typeContrat, dateFinContrat: jour(l.dateFinContrat), telephone: l.telephone, adresse: l.adresse, urgenceNom: l.urgenceNom, urgenceTelephone: l.urgenceTelephone, dateNaissance: l.dateNaissance },
      conges: conges.map((c) => ({ ...c, type: String(c.type), statut: String(c.statut) })),
      evaluations,
    };
  });
}

/**
 * Modifie les informations d'une fiche ouverte (liste blanche, validée) et trace la modification chez le propriétaire.
 * `lire` fournit les valeurs envoyées ; seuls les champs de la liste sont lus. Erreurs : clés françaises.
 */
export async function modifierFicheOuverte(u: UtilisateurConnecte, ownerId: string, type: TypeCible, id: string, lire: (cle: string) => string | null): Promise<{ ok: true; champs: string[] } | { ok: false; erreur: string }> {
  if (!peutModifierFichesOuvertes(u)) return { ok: false, erreur: m("Vous n'avez pas le droit de modifier une fiche d'une autre entreprise.") };
  const proprietaire = await proprietaireAutorise(u, ownerId);
  if (!proprietaire) return { ok: false, erreur: m("Fiche introuvable.") };
  const analyse = validerChampsFiche(type, lire);
  if (!analyse.ok) return analyse;
  const v = analyse.valeurs;

  const [mienne] = await db.select({ nom: entreprise.nom }).from(entreprise).where(eq(entreprise.id, u.entrepriseId));
  const [auteur] = await db.select({ nom: utilisateur.nomComplet }).from(utilisateur).where(and(eq(utilisateur.id, u.utilisateurId), eq(utilisateur.entrepriseId, u.entrepriseId)));

  return avecEntreprise(ownerId, async (tx: TransactionDrizzle) => {
    let champs: string[];
    if (type === "STAGIAIRE") {
      const [avant] = await tx.select().from(stagiaireAcademique).where(and(eq(stagiaireAcademique.id, id), eq(stagiaireAcademique.entrepriseId, ownerId)));
      if (!avant) return { ok: false as const, erreur: m("Fiche introuvable.") };
      champs = champsChanges(type, avant as unknown as Record<string, string | null>, v);
      await tx
        .update(stagiaireAcademique)
        .set({ etablissement: v.etablissement as string, filiere: v.filiere, niveau: v.niveau, telephone: v.telephone, email: v.email, tuteurEcoleNom: v.tuteurEcoleNom, tuteurEcoleContact: v.tuteurEcoleContact, mission: v.mission, dateNaissance: v.dateNaissance })
        .where(and(eq(stagiaireAcademique.id, id), eq(stagiaireAcademique.entrepriseId, ownerId)));
    } else {
      const [avant] = await tx
        .select({ poste: dossierRH.poste, typeContrat: dossierRH.typeContrat, dateFinContrat: dossierRH.dateFinContrat, telephone: dossierRH.telephone, adresse: dossierRH.adresse, urgenceNom: dossierRH.urgenceNom, urgenceTelephone: dossierRH.urgenceTelephone, dateNaissance: dossierRH.dateNaissance })
        .from(dossierRH)
        .innerJoin(utilisateur, eq(dossierRH.utilisateurId, utilisateur.id))
        .where(and(eq(utilisateur.id, id), eq(dossierRH.entrepriseId, ownerId), eq(utilisateur.entrepriseId, ownerId), ne(utilisateur.statut, "SUPPRIME")));
      if (!avant) return { ok: false as const, erreur: m("Fiche introuvable.") };
      champs = champsChanges(type, { ...avant, dateFinContrat: jour(avant.dateFinContrat) }, v);
      await tx
        .update(dossierRH)
        .set({ poste: v.poste as string, typeContrat: v.typeContrat as string, dateFinContrat: v.dateFinContrat ? new Date(`${v.dateFinContrat}T00:00:00Z`) : null, telephone: v.telephone, adresse: v.adresse, urgenceNom: v.urgenceNom, urgenceTelephone: v.urgenceTelephone, dateNaissance: v.dateNaissance })
        .where(and(eq(dossierRH.utilisateurId, id), eq(dossierRH.entrepriseId, ownerId)));
    }
    if (champs.length > 0) {
      await tx.insert(modificationFichePartagee).values({ entrepriseId: ownerId, cibleType: type, cibleId: id, auteurId: u.utilisateurId, auteurNom: auteur?.nom ?? "—", auteurEntrepriseId: u.entrepriseId, auteurEntrepriseNom: mienne?.nom ?? "—", champs: champs.join(", ") });
    }
    return { ok: true as const, champs };
  });
}

/** Modifications faites par d'autres entreprises sur une fiche (côté propriétaire, déjà dans sa transaction). */
export function modificationsRecues(tx: TransactionDrizzle, cibleIds: string[]) {
  if (cibleIds.length === 0) return Promise.resolve([] as { id: string; auteurNom: string; auteurEntrepriseNom: string; champs: string; creeLe: Date }[]);
  return tx
    .select({ id: modificationFichePartagee.id, auteurNom: modificationFichePartagee.auteurNom, auteurEntrepriseNom: modificationFichePartagee.auteurEntrepriseNom, champs: modificationFichePartagee.champs, creeLe: modificationFichePartagee.creeLe })
    .from(modificationFichePartagee)
    .where(inArray(modificationFichePartagee.cibleId, cibleIds))
    .orderBy(desc(modificationFichePartagee.creeLe))
    .limit(20);
}

/** Photo d'une personne d'une entreprise qui m'a ouvert ses fiches (utilisée par la route contrôlée des photos). */
export async function peutVoirPhotoOuverte(u: UtilisateurConnecte, personneId: string): Promise<boolean> {
  if (!peutVoirFichesOuvertes(u)) return false;
  const [p] = await db.select({ entrepriseId: utilisateur.entrepriseId, statut: utilisateur.statut }).from(utilisateur).where(eq(utilisateur.id, personneId));
  if (!p || p.entrepriseId === u.entrepriseId || p.statut !== "ACTIF") return false;
  return (await proprietairesOuvertsAMoi(u.entrepriseId)).some((x) => x.id === p.entrepriseId);
}
