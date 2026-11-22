import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { avecEntreprise, db, type TransactionDrizzle } from "@/db/client";
import { compte, dossierRH, entreprise, session, transfertEmploye, utilisateur } from "@/db/schema";
import { m } from "@/lib/i18n/catalogue";
import { listeAEnregistrer } from "@/lib/modules-libelles";
import { adressesAAlerter } from "@/lib/notifications/equipe";
import type { UtilisateurConnecte } from "@/lib/session";
import { emailArchive, roleTransferable, validerTexteTransfert } from "./transfert-regles";
import { ressourcesHumainesDisponibles } from "./missions";
import { gabaritTransfertDecide, gabaritTransfertPersonne, gabaritTransfertPropose } from "./transfert-email";

/**
 * Transfert d'un employé vers une autre entreprise du MÊME groupe (2026-11-22). L'Administrateur d'origine PROPOSE, l'Administrateur d'accueil
 * ACCEPTE ou REFUSE : rien ne bouge avant son accord.
 *
 * **Le compte déménage, l'historique reste.** À l'acceptation, la personne reçoit un NOUVEAU compte dans l'entreprise d'accueil (même adresse,
 * même mot de passe : l'enregistrement d'authentification est déplacé, ses sessions sont fermées) et son ancien compte reste dans l'entreprise
 * d'origine, désactivé, avec son adresse remplacée par une adresse d'archive : tout ce qui le référence (salaire, congés, évaluations, primes,
 * fichiers RH, tâches, messages) reste là-bas, jamais recopié ni exposé à la nouvelle entreprise. La fiche suit par une liste blanche : poste,
 * contrat, coordonnées, naissance, personne à prévenir, date d'arrivée d'origine (ancienneté du groupe), photo. **Jamais** le salaire, le solde
 * de congés, la politique de congé, le shift ni les accès aux modules (l'Administrateur d'accueil les définit).
 *
 * **Atomicité.** Le transfert touche deux entreprises ; il s'exécute dans UNE seule transaction (tout ou rien), qui bascule `app.entreprise_id`
 * entre les deux par `set_config` — le même mécanisme que `avecEntreprise`, avec des identifiants lus en base après vérification du groupe,
 * jamais venus du navigateur. La RLS n'est pas élargie : chaque écriture se fait sous l'entreprise qui la possède.
 */
export type Courrier = { to: string; sujet: string; html: string };
type Echec = { ok: false; erreur: string };
type Reussi = { ok: true; courriers: Courrier[] };

const MESSAGE_ABONNEMENT = m("Votre abonnement est suspendu : renouvelez-le pour accéder à cette fonctionnalité.");
const MESSAGE_GROUPE = m("Cette entreprise ne fait pas partie de votre groupe.");

function baseUrl(): string {
  return (process.env.BETTER_AUTH_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}

async function basculer(tx: TransactionDrizzle, entrepriseId: string): Promise<void> {
  await tx.execute(sql`SELECT set_config('app.entreprise_id', ${entrepriseId}, true)`);
}

/** Deux entreprises distinctes, dans le même groupe ? `entreprise` n'a pas de RLS ; renvoie leurs noms si oui. */
async function memeGroupe(tx: TransactionDrizzle, a: string, b: string): Promise<{ nomA: string; nomB: string } | null> {
  if (a === b) return null;
  const lignes = await tx.select({ id: entreprise.id, nom: entreprise.nom, groupeId: entreprise.groupeId }).from(entreprise).where(inArray(entreprise.id, [a, b]));
  const ea = lignes.find((l) => l.id === a);
  const eb = lignes.find((l) => l.id === b);
  if (!ea || !eb || !ea.groupeId || ea.groupeId !== eb.groupeId) return null;
  return { nomA: ea.nom, nomB: eb.nom };
}

/** Autres entreprises du groupe de `entrepriseId` : les destinations possibles. */
export async function entreprisesDuGroupe(entrepriseId: string): Promise<{ id: string; nom: string }[]> {
  const [moi] = await db.select({ groupeId: entreprise.groupeId }).from(entreprise).where(eq(entreprise.id, entrepriseId));
  if (!moi?.groupeId) return [];
  return db.select({ id: entreprise.id, nom: entreprise.nom }).from(entreprise).where(and(eq(entreprise.groupeId, moi.groupeId), ne(entreprise.id, entrepriseId))).orderBy(entreprise.nom);
}

/** Collaborateurs que l'Administrateur peut proposer au transfert : actifs, Employés ou Managers, avec une fiche RH, jamais lui-même. */
export async function personnesTransferables(tx: TransactionDrizzle, u: UtilisateurConnecte): Promise<{ id: string; nom: string; poste: string }[]> {
  if (u.role !== "ADMIN") return [];
  const lignes = await tx
    .select({ id: utilisateur.id, nom: utilisateur.nomComplet, poste: dossierRH.poste })
    .from(utilisateur)
    .innerJoin(dossierRH, eq(dossierRH.utilisateurId, utilisateur.id))
    .where(and(eq(utilisateur.entrepriseId, u.entrepriseId), eq(dossierRH.entrepriseId, u.entrepriseId), eq(utilisateur.statut, "ACTIF"), inArray(utilisateur.role, ["EMPLOYE", "MANAGER"]), ne(utilisateur.id, u.utilisateurId)))
    .orderBy(utilisateur.nomComplet);
  return lignes;
}

export async function listerTransferts(tx: TransactionDrizzle, u: UtilisateurConnecte) {
  if (u.role !== "ADMIN") return [];
  return tx.select().from(transfertEmploye).where(eq(transfertEmploye.entrepriseId, u.entrepriseId)).orderBy(desc(transfertEmploye.creeLe)).limit(100);
}

/** Responsables possibles dans l'entreprise d'accueil (Administrateurs et Managers actifs), pour l'écran d'acceptation. */
export async function responsablesPossibles(tx: TransactionDrizzle, u: UtilisateurConnecte): Promise<{ id: string; nom: string }[]> {
  if (u.role !== "ADMIN") return [];
  return tx
    .select({ id: utilisateur.id, nom: utilisateur.nomComplet })
    .from(utilisateur)
    .where(and(eq(utilisateur.entrepriseId, u.entrepriseId), eq(utilisateur.statut, "ACTIF"), inArray(utilisateur.role, ["ADMIN", "MANAGER"])))
    .orderBy(utilisateur.nomComplet);
}

/** L'Administrateur d'origine propose le transfert. Crée la ligne SORTANT chez lui et la ligne ENTRANT chez l'entreprise d'accueil. */
export async function proposerTransfert(u: UtilisateurConnecte, personneId: string, entrepriseCibleId: string, messageBrut: string): Promise<Echec | Reussi> {
  if (u.role !== "ADMIN") return { ok: false, erreur: m("Seul l'Administrateur peut transférer un collaborateur.") };
  const msg = validerTexteTransfert(messageBrut);
  if (!msg.ok) return msg;

  return avecEntreprise(u.entrepriseId, async (tx): Promise<Echec | Reussi> => {
    if (!(await ressourcesHumainesDisponibles(tx, u.entrepriseId))) return { ok: false, erreur: MESSAGE_ABONNEMENT };
    const groupe = await memeGroupe(tx, u.entrepriseId, String(entrepriseCibleId));
    if (!groupe) return { ok: false, erreur: MESSAGE_GROUPE };
    const [p] = await tx.select().from(utilisateur).where(and(eq(utilisateur.id, String(personneId)), eq(utilisateur.entrepriseId, u.entrepriseId), eq(utilisateur.statut, "ACTIF")));
    if (!p) return { ok: false, erreur: m("Collaborateur introuvable.") };
    if (p.id === u.utilisateurId) return { ok: false, erreur: m("Vous ne pouvez pas vous transférer vous-même.") };
    if (!roleTransferable(p.role)) return { ok: false, erreur: m("Seuls les Employés et les Managers peuvent être transférés.") };
    const [dossier] = await tx.select({ poste: dossierRH.poste }).from(dossierRH).where(and(eq(dossierRH.utilisateurId, p.id), eq(dossierRH.entrepriseId, u.entrepriseId)));
    if (!dossier) return { ok: false, erreur: m("Cette personne n'a pas de fiche RH à transférer.") };
    const [attente] = await tx.select({ id: transfertEmploye.id }).from(transfertEmploye).where(and(eq(transfertEmploye.utilisateurSourceId, p.id), eq(transfertEmploye.sens, "SORTANT"), eq(transfertEmploye.statut, "EN_ATTENTE")));
    if (attente) return { ok: false, erreur: m("Un transfert est déjà en attente pour cette personne.") };
    const [auteur] = await tx.select({ nom: utilisateur.nomComplet }).from(utilisateur).where(and(eq(utilisateur.id, u.utilisateurId), eq(utilisateur.entrepriseId, u.entrepriseId)));

    const commun = {
      transfertId: createId(),
      entrepriseSourceId: u.entrepriseId,
      entrepriseCibleId: String(entrepriseCibleId),
      nomEntrepriseSource: groupe.nomA,
      nomEntrepriseCible: groupe.nomB,
      utilisateurSourceId: p.id,
      nomPersonne: p.nomComplet,
      poste: dossier.poste,
      rolePersonne: p.role,
      message: msg.texte,
      proposeParId: u.utilisateurId,
      nomProposePar: auteur?.nom ?? "Administrateur",
    };
    await tx.insert(transfertEmploye).values({ ...commun, entrepriseId: u.entrepriseId, sens: "SORTANT" });
    await basculer(tx, commun.entrepriseCibleId);
    await tx.insert(transfertEmploye).values({ ...commun, entrepriseId: commun.entrepriseCibleId, sens: "ENTRANT" });
    const destinataires = await adressesAAlerter(tx, commun.entrepriseCibleId);
    await basculer(tx, u.entrepriseId);

    const { sujet, html } = gabaritTransfertPropose({ personne: p.nomComplet, poste: dossier.poste, origine: groupe.nomA, propose: commun.nomProposePar, message: msg.texte, base: baseUrl() });
    return { ok: true, courriers: destinataires.map((to) => ({ to, sujet, html })) };
  });
}

/** L'Administrateur d'origine retire sa proposition tant qu'elle n'a pas reçu de réponse. */
export async function annulerTransfert(u: UtilisateurConnecte, ligneId: string): Promise<Echec | Reussi> {
  if (u.role !== "ADMIN") return { ok: false, erreur: m("Seul l'Administrateur peut gérer les transferts.") };
  return avecEntreprise(u.entrepriseId, async (tx): Promise<Echec | Reussi> => {
    const [l] = await tx.select().from(transfertEmploye).where(and(eq(transfertEmploye.id, String(ligneId)), eq(transfertEmploye.entrepriseId, u.entrepriseId), eq(transfertEmploye.sens, "SORTANT")));
    if (!l) return { ok: false, erreur: m("Transfert introuvable.") };
    if (l.statut !== "EN_ATTENTE") return { ok: false, erreur: m("Ce transfert a déjà reçu une réponse.") };
    await tx.update(transfertEmploye).set({ statut: "ANNULE", decideLe: sql`now()` }).where(eq(transfertEmploye.id, l.id));
    await basculer(tx, l.entrepriseCibleId);
    await tx.update(transfertEmploye).set({ statut: "ANNULE", decideLe: sql`now()` }).where(and(eq(transfertEmploye.transfertId, l.transfertId), eq(transfertEmploye.sens, "ENTRANT"), eq(transfertEmploye.entrepriseId, l.entrepriseCibleId), eq(transfertEmploye.statut, "EN_ATTENTE")));
    await basculer(tx, u.entrepriseId);
    return { ok: true, courriers: [] };
  });
}

/** L'Administrateur d'accueil refuse : rien n'a bougé, l'entreprise d'origine est prévenue. */
export async function refuserTransfert(u: UtilisateurConnecte, ligneId: string, motifBrut: string): Promise<Echec | Reussi> {
  if (u.role !== "ADMIN") return { ok: false, erreur: m("Seul l'Administrateur peut gérer les transferts.") };
  const motif = validerTexteTransfert(motifBrut);
  if (!motif.ok) return motif;
  return avecEntreprise(u.entrepriseId, async (tx): Promise<Echec | Reussi> => {
    const [l] = await tx.select().from(transfertEmploye).where(and(eq(transfertEmploye.id, String(ligneId)), eq(transfertEmploye.entrepriseId, u.entrepriseId), eq(transfertEmploye.sens, "ENTRANT")));
    if (!l) return { ok: false, erreur: m("Transfert introuvable.") };
    if (l.statut !== "EN_ATTENTE") return { ok: false, erreur: m("Ce transfert a déjà reçu une réponse.") };
    await tx.update(transfertEmploye).set({ statut: "REFUSE", decideLe: sql`now()`, motifDecision: motif.texte }).where(eq(transfertEmploye.id, l.id));
    await basculer(tx, l.entrepriseSourceId);
    await tx.update(transfertEmploye).set({ statut: "REFUSE", decideLe: sql`now()`, motifDecision: motif.texte }).where(and(eq(transfertEmploye.transfertId, l.transfertId), eq(transfertEmploye.sens, "SORTANT"), eq(transfertEmploye.entrepriseId, l.entrepriseSourceId), eq(transfertEmploye.statut, "EN_ATTENTE")));
    const destinataires = await adressesAAlerter(tx, l.entrepriseSourceId);
    await basculer(tx, u.entrepriseId);
    const { sujet, html } = gabaritTransfertDecide({ personne: l.nomPersonne, accueil: l.nomEntrepriseCible, accepte: false, motif: motif.texte, base: baseUrl() });
    return { ok: true, courriers: destinataires.map((to) => ({ to, sujet, html })) };
  });
}

/**
 * L'Administrateur d'accueil accepte : le transfert s'exécute, en une seule transaction. Toutes les vérifications précèdent la moindre écriture
 * (groupe encore commun, personne toujours active dans l'entreprise d'origine, fiche RH présente, responsable choisi bien de l'entreprise d'accueil).
 */
export async function accepterTransfert(u: UtilisateurConnecte, ligneId: string, responsableId: string | null): Promise<Echec | Reussi> {
  if (u.role !== "ADMIN") return { ok: false, erreur: m("Seul l'Administrateur peut gérer les transferts.") };
  return avecEntreprise(u.entrepriseId, async (tx): Promise<Echec | Reussi> => {
    if (!(await ressourcesHumainesDisponibles(tx, u.entrepriseId))) return { ok: false, erreur: MESSAGE_ABONNEMENT };
    const [l] = await tx.select().from(transfertEmploye).where(and(eq(transfertEmploye.id, String(ligneId)), eq(transfertEmploye.entrepriseId, u.entrepriseId), eq(transfertEmploye.sens, "ENTRANT")));
    if (!l) return { ok: false, erreur: m("Transfert introuvable.") };
    if (l.statut !== "EN_ATTENTE") return { ok: false, erreur: m("Ce transfert a déjà reçu une réponse.") };
    if (l.entrepriseCibleId !== u.entrepriseId) return { ok: false, erreur: m("Transfert introuvable.") };
    if (!(await memeGroupe(tx, l.entrepriseSourceId, u.entrepriseId))) return { ok: false, erreur: m("Ces deux entreprises ne font plus partie du même groupe : le transfert est impossible.") };

    // La personne, relue en base : toujours active dans l'entreprise d'origine, rôle encore transférable (l'Administrateur a pu la promouvoir).
    const [ancien] = await tx.select().from(utilisateur).where(and(eq(utilisateur.id, l.utilisateurSourceId), eq(utilisateur.entrepriseId, l.entrepriseSourceId)));
    if (!ancien || ancien.statut !== "ACTIF") return { ok: false, erreur: m("Cette personne n'est plus active dans l'entreprise d'origine : le transfert est impossible.") };
    if (!roleTransferable(ancien.role)) return { ok: false, erreur: m("Seuls les Employés et les Managers peuvent être transférés.") };

    let managerCible: string | null = null;
    if (responsableId) {
      const [r] = await tx.select({ id: utilisateur.id }).from(utilisateur).where(and(eq(utilisateur.id, String(responsableId)), eq(utilisateur.entrepriseId, u.entrepriseId), eq(utilisateur.statut, "ACTIF"), inArray(utilisateur.role, ["ADMIN", "MANAGER"])));
      if (!r) return { ok: false, erreur: m("Responsable introuvable dans votre entreprise.") };
      managerCible = r.id;
    }

    // Côté origine : la fiche à recopier et la ligne miroir doivent exister.
    await basculer(tx, l.entrepriseSourceId);
    const [fiche] = await tx.select().from(dossierRH).where(and(eq(dossierRH.utilisateurId, ancien.id), eq(dossierRH.entrepriseId, l.entrepriseSourceId)));
    const [miroir] = await tx.select({ id: transfertEmploye.id }).from(transfertEmploye).where(and(eq(transfertEmploye.transfertId, l.transfertId), eq(transfertEmploye.sens, "SORTANT"), eq(transfertEmploye.entrepriseId, l.entrepriseSourceId), eq(transfertEmploye.statut, "EN_ATTENTE")));
    if (!fiche || !miroir) {
      await basculer(tx, u.entrepriseId);
      return { ok: false, erreur: m("La fiche RH de cette personne est introuvable dans l'entreprise d'origine : le transfert est impossible.") };
    }

    // --- Tables d'authentification (hors RLS stricte) : le nouveau compte reprend l'adresse et le mot de passe. ---
    await tx.update(utilisateur).set({ email: emailArchive(ancien.id), statut: "DESACTIVE", misAJourLe: sql`now()` }).where(eq(utilisateur.id, ancien.id));
    const [nouveau] = await tx
      .insert(utilisateur)
      .values({
        entrepriseId: u.entrepriseId,
        email: ancien.email,
        nomComplet: ancien.nomComplet,
        emailVerifie: ancien.emailVerifie,
        image: ancien.image,
        photoCleStockage: ancien.photoCleStockage,
        photoTypeMime: ancien.photoTypeMime,
        role: ancien.role,
        statut: "ACTIF",
        managerId: managerCible,
        langue: ancien.langue,
        theme: ancien.theme,
        // Un Employé repart du socle (fiche, tâches, chat) : l'Administrateur d'accueil lui accorde le reste ; un Manager garde « tous ceux du rôle ».
        modulesAutorises: ancien.role === "EMPLOYE" ? listeAEnregistrer("EMPLOYE", []) : null,
      })
      .returning({ id: utilisateur.id });
    await tx.update(compte).set({ accountId: nouveau.id }).where(and(eq(compte.userId, ancien.id), eq(compte.accountId, ancien.id)));
    await tx.update(compte).set({ userId: nouveau.id }).where(eq(compte.userId, ancien.id));
    await tx.delete(session).where(eq(session.userId, ancien.id));

    // --- Côté accueil : la fiche (liste blanche). Jamais le salaire, le solde de congés, la politique de congé ni le shift. ---
    await basculer(tx, u.entrepriseId);
    await tx.insert(dossierRH).values({
      entrepriseId: u.entrepriseId,
      utilisateurId: nouveau.id,
      poste: fiche.poste,
      dateNaissance: fiche.dateNaissance,
      telephone: fiche.telephone,
      adresse: fiche.adresse,
      urgenceNom: fiche.urgenceNom,
      urgenceTelephone: fiche.urgenceTelephone,
      typeContrat: fiche.typeContrat,
      dateEmbauche: fiche.dateEmbauche,
      dateFinContrat: fiche.dateFinContrat,
      nombrePersonnesACharge: fiche.nombrePersonnesACharge,
    });
    await tx.update(transfertEmploye).set({ statut: "ACCEPTE", decideLe: sql`now()`, nouvelUtilisateurId: nouveau.id }).where(eq(transfertEmploye.id, l.id));
    const adminsAccueil = await adressesAAlerter(tx, u.entrepriseId);

    // --- Côté origine : la relation de travail s'achève (même effet qu'un départ clôturé), l'équipe remonte d'un cran. ---
    await basculer(tx, l.entrepriseSourceId);
    await tx.update(dossierRH).set({ dateDepart: sql`now()` }).where(eq(dossierRH.id, fiche.id));
    await tx.update(utilisateur).set({ managerId: ancien.managerId }).where(and(eq(utilisateur.managerId, ancien.id), eq(utilisateur.entrepriseId, l.entrepriseSourceId)));
    await tx.update(transfertEmploye).set({ statut: "ACCEPTE", decideLe: sql`now()`, nouvelUtilisateurId: nouveau.id }).where(eq(transfertEmploye.id, miroir.id));
    const adminsOrigine = await adressesAAlerter(tx, l.entrepriseSourceId);
    await basculer(tx, u.entrepriseId);

    const base = baseUrl();
    const decide = gabaritTransfertDecide({ personne: ancien.nomComplet, accueil: l.nomEntrepriseCible, accepte: true, motif: null, base });
    const personne = gabaritTransfertPersonne({ nom: ancien.nomComplet, accueil: l.nomEntrepriseCible, origine: l.nomEntrepriseSource, base });
    return {
      ok: true,
      courriers: [
        ...adminsOrigine.filter((to) => !adminsAccueil.includes(to)).map((to) => ({ to, sujet: decide.sujet, html: decide.html })),
        { to: ancien.email, sujet: personne.sujet, html: personne.html },
      ],
    };
  });
}
