import { and, desc, eq, inArray, isNotNull, isNull, or } from "drizzle-orm";
import { generateRandomString } from "better-auth/crypto";
import type { TransactionDrizzle } from "@/db/client";
import { dossierRH, invitation, stagiaireAcademique, utilisateur } from "@/db/schema";
import { idsVisibles } from "@/lib/portee";
import type { UtilisateurConnecte } from "@/lib/session";

/**
 * Stagiaires (2026-10-27). Deux sortes, volontairement différentes :
 *  - le stagiaire PROFESSIONNEL est un employé de contrat « STAGE » : il a un compte, occupe déjà un poste, est rémunéré (`salaireBase`) et se trouve en
 *    période probatoire ; sa fin de stage est `dossierRH.dateFinContrat`. À la fin, l'Administrateur décide : embauché ou non retenu ;
 *  - le stagiaire ACADÉMIQUE est un étudiant en stage de formation : une fiche (`stagiaire_academique`), sans compte.
 * Logique sans session, testable ; les appelants (src/lib/actions/stagiaires.ts) vérifient les droits.
 */
export const SEUIL_FIN_PROCHE_JOURS = 14;
export type EtatStage = "EN_COURS" | "BIENTOT_FINI" | "ECHU" | "DECIDE";

/** Jours entiers restants avant la fin (négatif si dépassée). */
export function joursRestants(dateFin: Date, maintenant: Date = new Date()): number {
  return Math.ceil((dateFin.getTime() - maintenant.getTime()) / 86_400_000);
}

/** Où en est un stage : en cours, bientôt fini (≤ 14 jours), échu sans décision (à traiter), ou déjà décidé/terminé. */
export function etatStage(dateFin: Date | null, decisionPrise: boolean, maintenant: Date = new Date()): EtatStage {
  if (decisionPrise) return "DECIDE";
  if (!dateFin) return "EN_COURS";
  const j = joursRestants(dateFin, maintenant);
  if (j < 0) return "ECHU";
  return j <= SEUIL_FIN_PROCHE_JOURS ? "BIENTOT_FINI" : "EN_COURS";
}

// ---------------------------------------------------------------------------------------------------------------------
// Stagiaire professionnel (employé en période probatoire)
// ---------------------------------------------------------------------------------------------------------------------
export type DecisionStagePro = { decision: "EMBAUCHE"; typeContrat: "CDI" | "CDD"; dateFinCDD?: Date } | { decision: "NON_RETENU" };

/**
 * Décision de fin de stage d'un stagiaire professionnel. Embauché : le contrat devient CDI ou CDD (date de fin obligatoire), le compte est conservé tel quel.
 * Non retenu : la date de départ est posée et le compte est désactivé (plus aucun accès). Une décision n'est prise qu'une fois.
 */
export async function deciderStagePro(tx: TransactionDrizzle, entrepriseId: string, dossierRHId: string, decision: DecisionStagePro, dateEffet: Date, motif?: string): Promise<{ erreur?: string }> {
  const [d] = await tx
    .select({ typeContrat: dossierRH.typeContrat, decisionStage: dossierRH.decisionStage, utilisateurId: dossierRH.utilisateurId })
    .from(dossierRH)
    .where(and(eq(dossierRH.id, dossierRHId), eq(dossierRH.entrepriseId, entrepriseId)));
  if (!d) return { erreur: "Dossier RH introuvable." };
  if (d.typeContrat !== "STAGE") return { erreur: "Ce dossier n'est pas celui d'un stagiaire." };
  if (d.decisionStage) return { erreur: "Une décision a déjà été prise pour ce stage." };
  if (Number.isNaN(dateEffet.getTime())) return { erreur: "Date invalide." };
  const motifPropre = motif?.trim().slice(0, 500) || null;

  if (decision.decision === "EMBAUCHE") {
    if (decision.typeContrat === "CDD" && (!decision.dateFinCDD || Number.isNaN(decision.dateFinCDD.getTime()) || decision.dateFinCDD <= dateEffet)) return { erreur: "Un CDD a besoin d'une date de fin postérieure à la date d'embauche." };
    await tx
      .update(dossierRH)
      .set({ typeContrat: decision.typeContrat, dateFinContrat: decision.typeContrat === "CDD" ? (decision.dateFinCDD ?? null) : null, decisionStage: "EMBAUCHE", dateDecisionStage: dateEffet, motifDecisionStage: motifPropre })
      .where(and(eq(dossierRH.id, dossierRHId), eq(dossierRH.entrepriseId, entrepriseId)));
    return {};
  }

  await tx
    .update(dossierRH)
    .set({ decisionStage: "NON_RETENU", dateDecisionStage: dateEffet, motifDecisionStage: motifPropre, dateDepart: dateEffet })
    .where(and(eq(dossierRH.id, dossierRHId), eq(dossierRH.entrepriseId, entrepriseId)));
  // `utilisateur` est en RLS permissive : l'entreprise est filtrée explicitement.
  await tx.update(utilisateur).set({ statut: "DESACTIVE" }).where(and(eq(utilisateur.id, d.utilisateurId), eq(utilisateur.entrepriseId, entrepriseId)));
  return {};
}

export type StagiaireProLigne = { id: string; utilisateurId: string; nomComplet: string; poste: string; dateEmbauche: Date; dateFinContrat: Date | null; decisionStage: string | null; dateDecisionStage: Date | null };

/**
 * Stagiaires professionnels visibles par l'utilisateur : les dossiers RH de contrat « STAGE » de l'entreprise, plus ceux dont la décision de fin de stage
 * a été prise (un stagiaire embauché n'est plus « STAGE » mais garde sa trace). Portée RH : tout pour l'Administrateur, l'équipe pour un Manager.
 */
export async function listerStagiairesPro(tx: TransactionDrizzle, utilisateurConnecte: UtilisateurConnecte): Promise<StagiaireProLigne[]> {
  if (utilisateurConnecte.role !== "ADMIN" && utilisateurConnecte.role !== "MANAGER") return [];
  const ids = await idsVisibles(tx, utilisateurConnecte, "RH");
  return tx
    .select({
      id: dossierRH.id,
      utilisateurId: dossierRH.utilisateurId,
      nomComplet: utilisateur.nomComplet,
      poste: dossierRH.poste,
      dateEmbauche: dossierRH.dateEmbauche,
      dateFinContrat: dossierRH.dateFinContrat,
      decisionStage: dossierRH.decisionStage,
      dateDecisionStage: dossierRH.dateDecisionStage,
    })
    .from(dossierRH)
    .innerJoin(utilisateur, eq(dossierRH.utilisateurId, utilisateur.id))
    .where(
      and(
        eq(dossierRH.entrepriseId, utilisateurConnecte.entrepriseId),
        or(eq(dossierRH.typeContrat, "STAGE"), isNotNull(dossierRH.decisionStage)),
        ids === "TOUT" ? undefined : inArray(dossierRH.utilisateurId, ids)
      )
    )
    .orderBy(desc(dossierRH.dateEmbauche));
}

// ---------------------------------------------------------------------------------------------------------------------
// Stagiaire académique (fiche sans compte)
// ---------------------------------------------------------------------------------------------------------------------
export type StagiaireAcademique = typeof stagiaireAcademique.$inferSelect;

/** L'indemnité est une donnée de rémunération : jamais renvoyée à qui n'est pas Administrateur (le masque est appliqué ici, avant toute sortie vers une page). */
function masquer(fiche: StagiaireAcademique, utilisateurConnecte: UtilisateurConnecte): StagiaireAcademique {
  return utilisateurConnecte.role === "ADMIN" ? fiche : { ...fiche, indemniteMensuelle: null };
}

async function visibles(tx: TransactionDrizzle, utilisateurConnecte: UtilisateurConnecte): Promise<StagiaireAcademique[]> {
  if (utilisateurConnecte.role !== "ADMIN" && utilisateurConnecte.role !== "MANAGER") return [];
  const lignes = await tx.select().from(stagiaireAcademique).where(eq(stagiaireAcademique.entrepriseId, utilisateurConnecte.entrepriseId)).orderBy(desc(stagiaireAcademique.dateDebut));
  if (utilisateurConnecte.role === "ADMIN") return lignes;
  // Manager : les stagiaires dont il (ou son équipe) est le maître de stage, et ceux qu'il a lui-même créés.
  const ids = await idsVisibles(tx, utilisateurConnecte, "RH");
  const permis = ids === "TOUT" ? null : new Set(ids);
  return lignes.filter((l) => permis === null || (l.maitreStageId !== null && permis.has(l.maitreStageId)) || l.creeParId === utilisateurConnecte.utilisateurId);
}

export async function listerStagiairesAcademiques(tx: TransactionDrizzle, utilisateurConnecte: UtilisateurConnecte): Promise<StagiaireAcademique[]> {
  return (await visibles(tx, utilisateurConnecte)).map((f) => masquer(f, utilisateurConnecte));
}

/** Une fiche, seulement si l'utilisateur a le droit de la voir (sinon null, jamais de confirmation qu'elle existe). */
export async function trouverStagiaireAcademique(tx: TransactionDrizzle, utilisateurConnecte: UtilisateurConnecte, id: string): Promise<StagiaireAcademique | null> {
  const fiche = (await visibles(tx, utilisateurConnecte)).find((f) => f.id === id);
  return fiche ? masquer(fiche, utilisateurConnecte) : null;
}

export type SaisieStagiaire = {
  nom: string;
  telephone?: string;
  email?: string;
  etablissement: string;
  filiere?: string;
  niveau?: string;
  tuteurEcoleNom?: string;
  tuteurEcoleContact?: string;
  conventionReference?: string;
  mission?: string;
  serviceId?: string;
  maitreStageId?: string;
  dateDebut: Date;
  dateFin: Date;
  indemniteMensuelle?: number | null; // ignorée si l'auteur n'est pas Administrateur
  evaluation?: string;
};

/** Le maître de stage et le département doivent être de CETTE entreprise (`utilisateur` est en RLS permissive : filtre explicite). */
async function referencesValides(tx: TransactionDrizzle, entrepriseId: string, s: Pick<SaisieStagiaire, "maitreStageId">): Promise<string | null> {
  if (s.maitreStageId) {
    const [m] = await tx.select({ id: utilisateur.id }).from(utilisateur).where(and(eq(utilisateur.id, s.maitreStageId), eq(utilisateur.entrepriseId, entrepriseId)));
    if (!m) return "Maître de stage introuvable.";
  }
  return null;
}

function nettoyer(s: SaisieStagiaire) {
  const t = (v?: string) => v?.trim() || null;
  return {
    nom: s.nom.trim(),
    telephone: t(s.telephone),
    email: t(s.email)?.toLowerCase() ?? null,
    etablissement: s.etablissement.trim(),
    filiere: t(s.filiere),
    niveau: t(s.niveau),
    tuteurEcoleNom: t(s.tuteurEcoleNom),
    tuteurEcoleContact: t(s.tuteurEcoleContact),
    conventionReference: t(s.conventionReference),
    mission: t(s.mission),
    serviceId: s.serviceId || null,
    maitreStageId: s.maitreStageId || null,
    dateDebut: s.dateDebut,
    dateFin: s.dateFin,
    evaluation: t(s.evaluation),
  };
}

export async function creerStagiaireAcademique(tx: TransactionDrizzle, utilisateurConnecte: UtilisateurConnecte, saisie: SaisieStagiaire): Promise<{ erreur?: string; id?: string }> {
  if (saisie.dateFin < saisie.dateDebut) return { erreur: "La fin du stage ne peut pas précéder son début." };
  const erreurRef = await referencesValides(tx, utilisateurConnecte.entrepriseId, saisie);
  if (erreurRef) return { erreur: erreurRef };
  const [cree] = await tx
    .insert(stagiaireAcademique)
    .values({ entrepriseId: utilisateurConnecte.entrepriseId, creeParId: utilisateurConnecte.utilisateurId, ...nettoyer(saisie), indemniteMensuelle: utilisateurConnecte.role === "ADMIN" ? (saisie.indemniteMensuelle ?? null) : null })
    .returning({ id: stagiaireAcademique.id });
  return { id: cree.id };
}

export async function modifierStagiaireAcademique(tx: TransactionDrizzle, utilisateurConnecte: UtilisateurConnecte, id: string, saisie: SaisieStagiaire): Promise<{ erreur?: string }> {
  const fiche = await trouverStagiaireAcademique(tx, utilisateurConnecte, id);
  if (!fiche) return { erreur: "Fiche introuvable." };
  if (fiche.statut !== "EN_COURS") return { erreur: "Ce stage est clos : la fiche n'est plus modifiable." };
  if (saisie.dateFin < saisie.dateDebut) return { erreur: "La fin du stage ne peut pas précéder son début." };
  const erreurRef = await referencesValides(tx, utilisateurConnecte.entrepriseId, saisie);
  if (erreurRef) return { erreur: erreurRef };
  await tx
    .update(stagiaireAcademique)
    .set({ ...nettoyer(saisie), ...(utilisateurConnecte.role === "ADMIN" ? { indemniteMensuelle: saisie.indemniteMensuelle ?? null } : {}) })
    .where(and(eq(stagiaireAcademique.id, id), eq(stagiaireAcademique.entrepriseId, utilisateurConnecte.entrepriseId)));
  return {};
}

/** Clôture : stage terminé ou interrompu (avec l'évaluation et le motif). L'embauche passe par convertirStagiaireEnInvitation(). */
export async function cloturerStagiaireAcademique(tx: TransactionDrizzle, utilisateurConnecte: UtilisateurConnecte, id: string, statut: "TERMINE" | "INTERROMPU", evaluation?: string, motif?: string): Promise<{ erreur?: string }> {
  const fiche = await trouverStagiaireAcademique(tx, utilisateurConnecte, id);
  if (!fiche) return { erreur: "Fiche introuvable." };
  if (fiche.statut !== "EN_COURS") return { erreur: "Ce stage est déjà clos." };
  await tx
    .update(stagiaireAcademique)
    .set({ statut, decisionLe: new Date(), motifDecision: motif?.trim().slice(0, 500) || null, evaluation: evaluation?.trim() || fiche.evaluation })
    .where(and(eq(stagiaireAcademique.id, id), eq(stagiaireAcademique.entrepriseId, utilisateurConnecte.entrepriseId), isNull(stagiaireAcademique.invitationId)));
  return {};
}

const DUREE_EXPIRATION_INVITATION_MS = 72 * 60 * 60 * 1000; // même durée que creerInvitation()

/** L'étudiant est pris : une invitation (flux habituel, 72 h) est créée à son email ; le stage passe à « embauché ». Administrateur seulement (l'appelant le vérifie). */
export async function convertirStagiaireEnInvitation(
  tx: TransactionDrizzle,
  entrepriseId: string,
  id: string,
  role: "MANAGER" | "EMPLOYE",
  typeContrat: "STAGE" | "CDI" | "CDD",
  dateEmbauche: Date
): Promise<{ erreur?: string; jeton?: string }> {
  const [fiche] = await tx.select().from(stagiaireAcademique).where(and(eq(stagiaireAcademique.id, id), eq(stagiaireAcademique.entrepriseId, entrepriseId)));
  if (!fiche) return { erreur: "Fiche introuvable." };
  if (fiche.invitationId) return { erreur: "Ce stagiaire a déjà été embauché." };
  if (!fiche.email) return { erreur: "Cette fiche n'a pas d'adresse email : impossible d'envoyer une invitation." };
  if (Number.isNaN(dateEmbauche.getTime())) return { erreur: "Date invalide." };

  const jeton = generateRandomString(32, "a-z", "A-Z", "0-9");
  const [inv] = await tx
    .insert(invitation)
    .values({ entrepriseId, email: fiche.email, roleProposee: role, postePropose: fiche.mission ?? "Non renseigné", typeContratPropose: typeContrat, dateEmbauchePropose: dateEmbauche, jeton, expireLe: new Date(Date.now() + DUREE_EXPIRATION_INVITATION_MS) })
    .returning({ id: invitation.id });
  await tx.update(stagiaireAcademique).set({ statut: "EMBAUCHE", decisionLe: new Date(), invitationId: inv.id }).where(eq(stagiaireAcademique.id, id));
  return { jeton };
}

export async function supprimerStagiaireAcademique(tx: TransactionDrizzle, entrepriseId: string, id: string): Promise<{ erreur?: string }> {
  const [fiche] = await tx.select({ invitationId: stagiaireAcademique.invitationId }).from(stagiaireAcademique).where(and(eq(stagiaireAcademique.id, id), eq(stagiaireAcademique.entrepriseId, entrepriseId)));
  if (!fiche) return { erreur: "Fiche introuvable." };
  if (fiche.invitationId) return { erreur: "Ce stagiaire a été embauché : la fiche garde la trace de l'embauche et ne peut pas être supprimée." };
  await tx.delete(stagiaireAcademique).where(and(eq(stagiaireAcademique.id, id), eq(stagiaireAcademique.entrepriseId, entrepriseId)));
  return {};
}
