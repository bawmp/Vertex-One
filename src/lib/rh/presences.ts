import { and, eq, gte, inArray, isNull, lte, ne, or } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { demandeConge, dossierRH, entreprise, jonctionPresence, pointage, service, shift, utilisateur, validationPresence } from "@/db/schema";
import type { UtilisateurConnecte } from "@/lib/session";
import { isoDuJour, statutEffectif, totauxDe, STATUTS_PRESENCE, JOURS_MODIFIABLES_GERANT, type DroitFiche, type FichePresence, type LignePresence, type SectionPresence, type StatutPresence } from "./presences-commun";

export * from "./presences-commun";

/**
 * Fiche de présence journalière (2026-10-27) : une fiche par entreprise et par jour, tenue par un GÉRANT (un Manager, ou l'Administrateur) que
 * l'Administrateur peut changer à tout moment. Le gérant fait l'appel pour tous les employés ; chaque ligne est écrite dans `pointage` (une seule
 * source de vérité : congés, rapports et pointage personnel restent cohérents). Quand l'Administrateur le décide, des entreprises du même groupe
 * sont JOINTES à la fiche pour que tous les employés soient gérés au même endroit : il faut alors que LES DEUX entreprises aient activé le partage,
 * et chaque ligne est écrite dans l'entreprise de l'employé (la RLS n'est jamais élargie).
 */
// ---------------------------------------------------------------------------------------------------------------------
// Dates et heures
// ---------------------------------------------------------------------------------------------------------------------
const FORME_DATE = /^\d{4}-\d{2}-\d{2}$/;
const FORME_HEURE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function jourDepuisIso(iso: string): Date | null {
  if (!FORME_DATE.test(iso)) return null;
  const d = new Date(`${iso}T00:00:00`);
  // Une date impossible (31 février) serait silencieusement reportée au mois suivant : on la refuse en comparant le résultat à la saisie.
  return Number.isNaN(d.getTime()) || isoDuJour(d) !== iso ? null : d;
}


function heureSurJour(jour: Date, hhmm: string | null | undefined): Date | null {
  if (!hhmm) return null;
  if (!FORME_HEURE.test(hhmm)) return null;
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date(jour);
  d.setHours(h, m, 0, 0);
  return d;
}

function versHHmm(date: Date | null): string | null {
  if (!date) return null;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(date.getHours())}:${p(date.getMinutes())}`;
}

/** Une journée est modifiable par le gérant : pas dans le futur, pas plus ancienne que 31 jours. L'Administrateur n'a que la limite du futur. */
export function jourModifiable(jour: Date, droit: DroitFiche, maintenant: Date = new Date()): boolean {
  const aujourdhui = new Date(maintenant);
  aujourdhui.setHours(0, 0, 0, 0);
  if (jour > aujourdhui) return false;
  if (droit === "ADMIN") return true;
  return (aujourdhui.getTime() - jour.getTime()) / 86_400_000 <= JOURS_MODIFIABLES_GERANT;
}

// ---------------------------------------------------------------------------------------------------------------------
// Droits
// ---------------------------------------------------------------------------------------------------------------------
/** L'Administrateur, ou le gérant désigné (un Manager). Jamais un autre Manager, jamais un Employé. */
export async function droitSurFiche(utilisateurConnecte: UtilisateurConnecte): Promise<DroitFiche | null> {
  if (utilisateurConnecte.role === "ADMIN") return "ADMIN";
  if (utilisateurConnecte.role !== "MANAGER") return null;
  const [e] = await db.select({ gerant: entreprise.gerantPresencesId }).from(entreprise).where(eq(entreprise.id, utilisateurConnecte.entrepriseId));
  return e?.gerant === utilisateurConnecte.utilisateurId ? "GERANT" : null;
}

/** Candidats au poste de gérant : les Managers et Administrateurs actifs de l'entreprise (`utilisateur` est en RLS permissive : filtre explicite). */
export async function gerantsPossibles(entrepriseId: string): Promise<{ id: string; nom: string; role: string }[]> {
  const lignes = await db
    .select({ id: utilisateur.id, nom: utilisateur.nomComplet, role: utilisateur.role })
    .from(utilisateur)
    .where(and(eq(utilisateur.entrepriseId, entrepriseId), inArray(utilisateur.role, ["ADMIN", "MANAGER"]), eq(utilisateur.statut, "ACTIF")));
  return lignes.sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
}

/** L'Administrateur désigne (ou retire, `null`) le gérant de la fiche. */
export async function definirGerantPresences(entrepriseId: string, gerantId: string | null): Promise<{ erreur?: string }> {
  if (gerantId !== null) {
    const candidats = await gerantsPossibles(entrepriseId);
    if (!candidats.some((c) => c.id === gerantId)) return { erreur: "Le gérant doit être un Manager ou un Administrateur actif de l'entreprise." };
  }
  await db.update(entreprise).set({ gerantPresencesId: gerantId }).where(eq(entreprise.id, entrepriseId));
  return {};
}

// ---------------------------------------------------------------------------------------------------------------------
// Entreprises jointes
// ---------------------------------------------------------------------------------------------------------------------
export type Partenaire = { id: string; nom: string };

/** Entreprises jointes à la fiche de `entrepriseId`, ET encore valables : même groupe, partage activé des deux côtés. */
export async function partenairesPresence(entrepriseId: string): Promise<Partenaire[]> {
  const [moi] = await db.select({ groupeId: entreprise.groupeId, partage: entreprise.presencesPartageesGroupe }).from(entreprise).where(eq(entreprise.id, entrepriseId));
  if (!moi?.groupeId || !moi.partage) return [];
  const jonctions = await avecEntreprise(entrepriseId, (tx) => tx.select({ partenaireId: jonctionPresence.partenaireId }).from(jonctionPresence).where(eq(jonctionPresence.entrepriseId, entrepriseId)));
  if (jonctions.length === 0) return [];
  return db
    .select({ id: entreprise.id, nom: entreprise.nom })
    .from(entreprise)
    .where(and(inArray(entreprise.id, jonctions.map((j) => j.partenaireId)), eq(entreprise.groupeId, moi.groupeId), ne(entreprise.id, entrepriseId), eq(entreprise.presencesPartageesGroupe, true)))
    .orderBy(entreprise.nom);
}

export type PartenairePossible = { id: string; nom: string; partageActif: boolean; joint: boolean };

/** Pour l'écran de l'Administrateur : les autres entreprises du groupe, si elles ont activé le partage, et si elles sont jointes à la fiche. */
export async function partenairesPossibles(entrepriseId: string): Promise<{ groupe: boolean; partageActif: boolean; autres: PartenairePossible[] }> {
  const [moi] = await db.select({ groupeId: entreprise.groupeId, partage: entreprise.presencesPartageesGroupe }).from(entreprise).where(eq(entreprise.id, entrepriseId));
  if (!moi?.groupeId) return { groupe: false, partageActif: moi?.partage ?? false, autres: [] };
  const autres = await db.select({ id: entreprise.id, nom: entreprise.nom, partage: entreprise.presencesPartageesGroupe }).from(entreprise).where(and(eq(entreprise.groupeId, moi.groupeId), ne(entreprise.id, entrepriseId))).orderBy(entreprise.nom);
  const jonctions = await avecEntreprise(entrepriseId, (tx) => tx.select({ partenaireId: jonctionPresence.partenaireId }).from(jonctionPresence).where(eq(jonctionPresence.entrepriseId, entrepriseId)));
  const joints = new Set(jonctions.map((j) => j.partenaireId));
  return { groupe: true, partageActif: moi.partage, autres: autres.map((a) => ({ id: a.id, nom: a.nom, partageActif: a.partage, joint: joints.has(a.id) })) };
}

export async function definirPartagePresences(entrepriseId: string, actif: boolean): Promise<void> {
  await db.update(entreprise).set({ presencesPartageesGroupe: actif }).where(eq(entreprise.id, entrepriseId));
}

/**
 * L'Administrateur joint (ou détache) une entreprise du groupe à sa fiche. Il faut que les deux entreprises soient dans le même groupe et aient activé
 * le partage ; détacher est toujours possible.
 */
export async function joindrePartenairePresence(entrepriseId: string, creeParId: string, partenaireId: string, joindre: boolean): Promise<{ erreur?: string }> {
  if (!joindre) {
    await avecEntreprise(entrepriseId, (tx) => tx.delete(jonctionPresence).where(and(eq(jonctionPresence.entrepriseId, entrepriseId), eq(jonctionPresence.partenaireId, partenaireId))));
    return {};
  }
  const { groupe, partageActif, autres } = await partenairesPossibles(entrepriseId);
  if (!groupe) return { erreur: "Votre entreprise n'appartient à aucun groupe." };
  if (!partageActif) return { erreur: "Activez d'abord le partage des présences avec le groupe pour votre entreprise." };
  const cible = autres.find((a) => a.id === partenaireId);
  if (!cible) return { erreur: "Cette entreprise n'est pas dans votre groupe." };
  if (!cible.partageActif) return { erreur: `${cible.nom} n'a pas activé le partage des présences : son Administrateur doit le faire d'abord.` };
  if (cible.joint) return {};
  await avecEntreprise(entrepriseId, (tx) => tx.insert(jonctionPresence).values({ entrepriseId, partenaireId, creeParId }));
  return {};
}

// ---------------------------------------------------------------------------------------------------------------------
// Lecture de la fiche
// ---------------------------------------------------------------------------------------------------------------------
type DossierSection = { dossierRHId: string; utilisateurId: string; nom: string; poste: string; service: string | null; shiftDebut: string | null; shiftTolerance: number };

async function lireSection(entrepriseId: string, entrepriseNom: string, propre: boolean, jour: Date): Promise<SectionPresence> {
  const finJour = new Date(jour);
  finJour.setHours(23, 59, 59, 999);
  return avecEntreprise(entrepriseId, async (tx) => {
    const dossiers: DossierSection[] = (
      await tx
        .select({ dossierRHId: dossierRH.id, utilisateurId: dossierRH.utilisateurId, nom: utilisateur.nomComplet, poste: dossierRH.poste, serviceNom: service.nom, shiftDebut: shift.heureDebut, shiftTolerance: shift.toleranceMinutes })
        .from(dossierRH)
        .innerJoin(utilisateur, eq(dossierRH.utilisateurId, utilisateur.id))
        .leftJoin(service, eq(utilisateur.serviceId, service.id))
        .leftJoin(shift, eq(dossierRH.shiftId, shift.id))
        .where(and(eq(dossierRH.entrepriseId, entrepriseId), eq(utilisateur.statut, "ACTIF"), ne(utilisateur.role, "CLIENT"), lte(dossierRH.dateEmbauche, finJour), or(isNull(dossierRH.dateDepart), gte(dossierRH.dateDepart, jour))))
    ).map((d) => ({ dossierRHId: d.dossierRHId, utilisateurId: d.utilisateurId, nom: d.nom, poste: d.poste, service: d.serviceNom ?? null, shiftDebut: d.shiftDebut ? d.shiftDebut.slice(0, 5) : null, shiftTolerance: d.shiftTolerance ?? 0 }));
    if (dossiers.length === 0) return { entrepriseId, entrepriseNom, propre, lignes: [] };

    const ids = dossiers.map((d) => d.dossierRHId);
    const lignesPointage = await tx.select().from(pointage).where(and(inArray(pointage.dossierRHId, ids), eq(pointage.date, jour)));
    const conges = await tx.select({ dossierRHId: demandeConge.dossierRHId }).from(demandeConge).where(and(inArray(demandeConge.dossierRHId, ids), eq(demandeConge.statut, "APPROUVEE"), lte(demandeConge.dateDebut, finJour), gte(demandeConge.dateFin, jour)));
    const enConge = new Set(conges.map((c) => c.dossierRHId));
    const auteursIds = [...new Set(lignesPointage.map((l) => l.saisiParId).filter((x): x is string => !!x))];
    const auteurs = auteursIds.length ? await tx.select({ id: utilisateur.id, nom: utilisateur.nomComplet }).from(utilisateur).where(inArray(utilisateur.id, auteursIds)) : [];
    const nomAuteur = new Map(auteurs.map((a) => [a.id, a.nom]));
    const parDossier = new Map(lignesPointage.map((l) => [l.dossierRHId, l]));

    const lignes: LignePresence[] = dossiers
      .map((d) => {
        const p = parDossier.get(d.dossierRHId);
        return {
          dossierRHId: d.dossierRHId,
          utilisateurId: d.utilisateurId,
          nom: d.nom,
          poste: d.poste,
          service: d.service,
          statut: (p?.statut as StatutPresence | undefined) ?? null,
          heureArrivee: versHHmm(p?.heureArrivee ?? null),
          heureDepart: versHHmm(p?.heureDepart ?? null),
          remarque: p?.remarque ?? null,
          enCongeApprouve: enConge.has(d.dossierRHId),
          shiftDebut: d.shiftDebut,
          shiftTolerance: d.shiftTolerance,
          saisiPar: p?.saisiParId ? (nomAuteur.get(p.saisiParId) ?? null) : null,
        };
      })
      .sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
    return { entrepriseId, entrepriseNom, propre, lignes };
  });
}

/** La fiche d'un jour : l'entreprise de l'utilisateur, puis les entreprises jointes valables. null si l'utilisateur n'a pas le droit de la voir. */
export async function chargerFiche(utilisateurConnecte: UtilisateurConnecte, dateIso: string): Promise<FichePresence | null> {
  const droit = await droitSurFiche(utilisateurConnecte);
  const jour = jourDepuisIso(dateIso);
  if (!droit || !jour) return null;
  const entrepriseId = utilisateurConnecte.entrepriseId;

  const [moi] = await db.select({ nom: entreprise.nom, gerant: entreprise.gerantPresencesId }).from(entreprise).where(eq(entreprise.id, entrepriseId));
  if (!moi) return null;
  const gerant = moi.gerant ? ((await gerantsPossibles(entrepriseId)).find((g) => g.id === moi.gerant) ?? null) : null;

  const sections = [await lireSection(entrepriseId, moi.nom, true, jour)];
  for (const p of await partenairesPresence(entrepriseId)) sections.push(await lireSection(p.id, p.nom, false, jour));

  const validation = await avecEntreprise(entrepriseId, async (tx) => {
    const [v] = await tx.select().from(validationPresence).where(and(eq(validationPresence.entrepriseId, entrepriseId), eq(validationPresence.date, jour)));
    if (!v) return null;
    const [par] = await tx.select({ nom: utilisateur.nomComplet }).from(utilisateur).where(eq(utilisateur.id, v.valideeParId));
    return { parNom: par?.nom ?? "—", le: v.valideeLe };
  });

  return {
    date: dateIso,
    droit,
    gerant: gerant ? { id: gerant.id, nom: gerant.nom } : null,
    validee: validation,
    sections,
    totaux: totauxDe(sections),
    modifiable: jourModifiable(jour, droit) && (!validation || droit === "ADMIN"),
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Écriture
// ---------------------------------------------------------------------------------------------------------------------
export type SaisiePresence = { entrepriseId: string; dossierRHId: string; date: string; statut: StatutPresence; heureArrivee?: string | null; heureDepart?: string | null; remarque?: string | null };

/** L'entreprise visée est la sienne ou une entreprise jointe encore valable : jamais un identifiant pris tel quel. */
async function entrepriseAutorisee(utilisateurConnecte: UtilisateurConnecte, cibleId: string): Promise<boolean> {
  if (cibleId === utilisateurConnecte.entrepriseId) return true;
  return (await partenairesPresence(utilisateurConnecte.entrepriseId)).some((p) => p.id === cibleId);
}

async function fichePermiseEnEcriture(utilisateurConnecte: UtilisateurConnecte, jour: Date): Promise<{ droit: DroitFiche } | { erreur: string }> {
  const droit = await droitSurFiche(utilisateurConnecte);
  if (!droit) return { erreur: "Seuls l'Administrateur et le gérant de la fiche de présence peuvent la modifier." };
  if (!jourModifiable(jour, droit)) return { erreur: droit === "GERANT" ? `Cette journée n'est plus modifiable (jours futurs et plus de ${JOURS_MODIFIABLES_GERANT} jours en arrière : demandez à l'Administrateur).` : "Impossible de renseigner une journée à venir." };
  const validee = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => (await tx.select({ id: validationPresence.id }).from(validationPresence).where(and(eq(validationPresence.entrepriseId, utilisateurConnecte.entrepriseId), eq(validationPresence.date, jour))))[0]);
  if (validee && droit !== "ADMIN") return { erreur: "La fiche de ce jour est validée : l'Administrateur doit la rouvrir pour la modifier." };
  return { droit };
}

export async function enregistrerPresence(utilisateurConnecte: UtilisateurConnecte, s: SaisiePresence): Promise<{ erreur?: string }> {
  const jour = jourDepuisIso(s.date);
  if (!jour) return { erreur: "Date invalide." };
  if (!STATUTS_PRESENCE.includes(s.statut)) return { erreur: "Statut invalide." };
  const permis = await fichePermiseEnEcriture(utilisateurConnecte, jour);
  if ("erreur" in permis) return permis;
  if (!(await entrepriseAutorisee(utilisateurConnecte, s.entrepriseId))) return { erreur: "Cette entreprise n'est pas jointe à votre fiche de présence." };

  const sansHeures = s.statut === "ABSENT" || s.statut === "CONGE";
  const arrivee = sansHeures ? null : heureSurJour(jour, s.heureArrivee);
  const depart = sansHeures ? null : heureSurJour(jour, s.heureDepart);
  if (!sansHeures && s.heureArrivee && !arrivee) return { erreur: "Heure d'arrivée invalide (HH:MM)." };
  if (!sansHeures && s.heureDepart && !depart) return { erreur: "Heure de départ invalide (HH:MM)." };
  if (arrivee && depart && depart < arrivee) return { erreur: "Le départ ne peut pas précéder l'arrivée." };
  const remarque = s.remarque?.trim().slice(0, 300) || null;

  return avecEntreprise(s.entrepriseId, async (tx) => {
    // Le dossier doit être un employé actif DE CETTE entreprise (`utilisateur` est en RLS permissive : filtre explicite).
    const [d] = await tx
      .select({ id: dossierRH.id })
      .from(dossierRH)
      .innerJoin(utilisateur, eq(dossierRH.utilisateurId, utilisateur.id))
      .where(and(eq(dossierRH.id, s.dossierRHId), eq(dossierRH.entrepriseId, s.entrepriseId), eq(utilisateur.statut, "ACTIF")));
    if (!d) return { erreur: "Employé introuvable." };

    const valeurs = { statut: s.statut, heureArrivee: arrivee, heureDepart: depart, remarque, saisiParId: utilisateurConnecte.utilisateurId, saisiLe: new Date() };
    const [existant] = await tx.select({ id: pointage.id }).from(pointage).where(and(eq(pointage.dossierRHId, s.dossierRHId), eq(pointage.date, jour)));
    if (existant) await tx.update(pointage).set(valeurs).where(eq(pointage.id, existant.id));
    else await tx.insert(pointage).values({ entrepriseId: s.entrepriseId, dossierRHId: s.dossierRHId, date: jour, ...valeurs });
    return {};
  });
}

/** Marque « présent » tous ceux qui n'ont encore ni ligne ni congé approuvé ce jour-là (appel rapide) ; renvoie le nombre de lignes créées. */
export async function marquerTousPresents(utilisateurConnecte: UtilisateurConnecte, dateIso: string): Promise<{ erreur?: string; nombre?: number }> {
  const jour = jourDepuisIso(dateIso);
  if (!jour) return { erreur: "Date invalide." };
  const permis = await fichePermiseEnEcriture(utilisateurConnecte, jour);
  if ("erreur" in permis) return permis;

  const fiche = await chargerFiche(utilisateurConnecte, dateIso);
  if (!fiche) return { erreur: "Fiche introuvable." };
  let nombre = 0;
  for (const section of fiche.sections) {
    const aMarquer = section.lignes.filter((l) => statutEffectif(l) === null);
    if (aMarquer.length === 0) continue;
    await avecEntreprise(section.entrepriseId, async (tx) => {
      for (const l of aMarquer) {
        await tx.insert(pointage).values({ entrepriseId: section.entrepriseId, dossierRHId: l.dossierRHId, date: jour, statut: "PRESENT", saisiParId: utilisateurConnecte.utilisateurId, saisiLe: new Date() }).onConflictDoNothing();
        nombre++;
      }
    });
  }
  return { nombre };
}

/** Le gérant (ou l'Administrateur) valide la fiche du jour : elle n'est plus modifiable que par l'Administrateur. */
export async function validerFiche(utilisateurConnecte: UtilisateurConnecte, dateIso: string): Promise<{ erreur?: string }> {
  const jour = jourDepuisIso(dateIso);
  if (!jour) return { erreur: "Date invalide." };
  const permis = await fichePermiseEnEcriture(utilisateurConnecte, jour);
  if ("erreur" in permis) return permis;
  await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) => tx.insert(validationPresence).values({ entrepriseId: utilisateurConnecte.entrepriseId, date: jour, valideeParId: utilisateurConnecte.utilisateurId }).onConflictDoNothing());
  return {};
}

export async function rouvrirFiche(utilisateurConnecte: UtilisateurConnecte, dateIso: string): Promise<{ erreur?: string }> {
  if (utilisateurConnecte.role !== "ADMIN") return { erreur: "Seul l'Administrateur peut rouvrir une fiche validée." };
  const jour = jourDepuisIso(dateIso);
  if (!jour) return { erreur: "Date invalide." };
  await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) => tx.delete(validationPresence).where(and(eq(validationPresence.entrepriseId, utilisateurConnecte.entrepriseId), eq(validationPresence.date, jour))));
  return {};
}
