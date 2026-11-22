import { and, desc, eq, notInArray, sql } from "drizzle-orm";
import { generateRandomString } from "better-auth/crypto";
import type { TransactionDrizzle } from "@/db/client";
import { demandeCollaborateur, invitation, utilisateur } from "@/db/schema";
import { m } from "@/lib/i18n/catalogue";
import { ROLES_NON_COLLEGUES } from "@/lib/equipe/collegues";
import { adressesAAlerter } from "@/lib/notifications/equipe";
import { peut } from "@/lib/permissions";
import type { UtilisateurConnecte } from "@/lib/session";
import { gabaritDemandeConfirmee, gabaritDemandeDeposee, gabaritDemandeRefusee } from "./demande-collaborateur-email";
import { validerNouveauCollaborateur, type NouveauCollaborateurValide, type SaisieNouveauCollaborateur } from "./nouveau-collaborateur";
import { ressourcesHumainesDisponibles } from "./missions";

/**
 * Création d'une fiche collaborateur par un Manager : une DEMANDE que l'Administrateur confirme (2026-11-22).
 *
 * - **L'Administrateur crée directement** (aucune confirmation à demander à lui-même) : `creerInvitationCollaborateur` partagé.
 * - **Un Manager dépose une demande** : rien n'existe encore — ni invitation, ni compte, ni fiche. Aucun email ne part vers la personne.
 * - **L'Administrateur confirme** (en pouvant corriger poste, contrat, dates, responsable) : l'invitation est alors créée et envoyée, la fiche
 *   naît à l'activation du compte. Ou il **refuse** avec un motif ; le Manager est prévenu dans les deux cas.
 * - **Le salaire n'apparaît nulle part** dans ce circuit : il est saisi par l'Administrateur seul, sur la fiche, après l'activation. Il reste
 *   visible de l'Administrateur et de la personne uniquement.
 */
export const DUREE_INVITATION_MS = 72 * 60 * 60 * 1000;
export type Courrier = { to: string; sujet: string; html: string };
type Echec = { ok: false; erreur: string };

const aujourdhuiDouala = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Douala" }).format(new Date());
const base = () => (process.env.BETTER_AUTH_URL ?? "http://localhost:3000").replace(/\/+$/, "");
const MESSAGE_ABONNEMENT = m("Votre abonnement est suspendu : renouvelez-le pour accéder à cette fonctionnalité.");

/** Crée l'invitation d'un collaborateur (rôle Employé) ; refuse une adresse qui a déjà un compte, sans tenir compte de la casse. */
export async function creerInvitationCollaborateur(tx: TransactionDrizzle, entrepriseId: string, v: NouveauCollaborateurValide, responsableId: string | undefined): Promise<{ ok: true; jeton: string; invitationId: string } | Echec> {
  const [dejaCompte] = await tx.select({ id: utilisateur.id }).from(utilisateur).where(sql`lower(${utilisateur.email}) = ${v.email}`);
  if (dejaCompte) return { ok: false, erreur: m("Cette adresse email a déjà un compte.") };
  const jeton = generateRandomString(32, "a-z", "A-Z", "0-9");
  const [inv] = await tx
    .insert(invitation)
    .values({
      entrepriseId,
      email: v.email,
      roleProposee: "EMPLOYE",
      postePropose: v.poste,
      typeContratPropose: v.typeContrat,
      dateEmbauchePropose: new Date(`${v.dateEmbauche}T00:00:00`),
      dateFinPropose: v.dateFin ? new Date(`${v.dateFin}T00:00:00`) : undefined,
      dateNaissancePropose: v.dateNaissance ?? undefined,
      managerPropose: responsableId,
      jeton,
      expireLe: new Date(Date.now() + DUREE_INVITATION_MS),
    })
    .returning({ id: invitation.id });
  return { ok: true, jeton, invitationId: inv.id };
}

/** Le Manager dépose une demande de fiche. L'Administrateur est prévenu par email (renvoyé à l'appelant, à envoyer après la transaction). */
export async function deposerDemande(tx: TransactionDrizzle, u: UtilisateurConnecte, saisie: SaisieNouveauCollaborateur): Promise<{ ok: true; courriers: Courrier[] } | Echec> {
  if (u.role !== "MANAGER" || !peut(u, "RH", "CREER")) return { ok: false, erreur: m("Vous n'avez pas le droit de créer la fiche d'un collaborateur.") };
  if (!(await ressourcesHumainesDisponibles(tx, u.entrepriseId))) return { ok: false, erreur: MESSAGE_ABONNEMENT };
  const v = validerNouveauCollaborateur(saisie, aujourdhuiDouala());
  if (!v.ok) return v;
  const { email, poste, typeContrat, dateEmbauche, dateFin, dateNaissance } = v.valeurs;
  const [dejaCompte] = await tx.select({ id: utilisateur.id }).from(utilisateur).where(sql`lower(${utilisateur.email}) = ${email}`);
  if (dejaCompte) return { ok: false, erreur: m("Cette adresse email a déjà un compte.") };
  const [attente] = await tx.select({ id: demandeCollaborateur.id }).from(demandeCollaborateur).where(and(eq(demandeCollaborateur.entrepriseId, u.entrepriseId), eq(demandeCollaborateur.email, email), eq(demandeCollaborateur.statut, "EN_ATTENTE")));
  if (attente) return { ok: false, erreur: m("Une demande est déjà en attente pour cette adresse email.") };

  // Le responsable est d'office le Manager qui dépose la demande (jamais une valeur du navigateur) ; l'Administrateur peut le changer en confirmant.
  await tx.insert(demandeCollaborateur).values({ entrepriseId: u.entrepriseId, demandeParId: u.utilisateurId, email, poste, typeContrat, dateEmbauche, dateFin, dateNaissance, responsableId: u.utilisateurId });
  const [auteur] = await tx.select({ nom: utilisateur.nomComplet }).from(utilisateur).where(and(eq(utilisateur.id, u.utilisateurId), eq(utilisateur.entrepriseId, u.entrepriseId)));
  const destinataires = await adressesAAlerter(tx, u.entrepriseId);
  const { sujet, html } = gabaritDemandeDeposee({ manager: auteur?.nom ?? "Un Manager", poste, contrat: typeContrat, email, base: base() });
  return { ok: true, courriers: destinataires.map((to) => ({ to, sujet, html })) };
}

export type DemandeLue = {
  id: string;
  demandeParId: string;
  nomDemandeur: string;
  email: string;
  poste: string;
  typeContrat: string;
  dateEmbauche: string;
  dateFin: string | null;
  dateNaissance: string | null;
  responsableId: string | null;
  statut: string;
  motifRefus: string | null;
  creeLe: Date;
  decideLe: Date | null;
};

/** L'Administrateur lit toutes les demandes de son entreprise ; un Manager seulement les siennes ; les autres rôles aucune. */
export async function lireDemandes(tx: TransactionDrizzle, u: UtilisateurConnecte): Promise<DemandeLue[]> {
  if (u.role !== "ADMIN" && !(u.role === "MANAGER" && peut(u, "RH", "CREER"))) return [];
  const conditions = [eq(demandeCollaborateur.entrepriseId, u.entrepriseId), eq(utilisateur.entrepriseId, u.entrepriseId)];
  if (u.role === "MANAGER") conditions.push(eq(demandeCollaborateur.demandeParId, u.utilisateurId));
  return tx
    .select({
      id: demandeCollaborateur.id,
      demandeParId: demandeCollaborateur.demandeParId,
      nomDemandeur: utilisateur.nomComplet,
      email: demandeCollaborateur.email,
      poste: demandeCollaborateur.poste,
      typeContrat: demandeCollaborateur.typeContrat,
      dateEmbauche: demandeCollaborateur.dateEmbauche,
      dateFin: demandeCollaborateur.dateFin,
      dateNaissance: demandeCollaborateur.dateNaissance,
      responsableId: demandeCollaborateur.responsableId,
      statut: demandeCollaborateur.statut,
      motifRefus: demandeCollaborateur.motifRefus,
      creeLe: demandeCollaborateur.creeLe,
      decideLe: demandeCollaborateur.decideLe,
    })
    .from(demandeCollaborateur)
    .innerJoin(utilisateur, eq(demandeCollaborateur.demandeParId, utilisateur.id))
    .where(and(...conditions))
    .orderBy(desc(demandeCollaborateur.creeLe))
    .limit(100);
}

/** Nombre de demandes en attente (tableau de bord de l'Administrateur). */
export async function compterDemandesEnAttente(tx: TransactionDrizzle, u: UtilisateurConnecte): Promise<number> {
  if (u.role !== "ADMIN") return 0;
  const lignes = await tx.select({ id: demandeCollaborateur.id }).from(demandeCollaborateur).where(and(eq(demandeCollaborateur.entrepriseId, u.entrepriseId), eq(demandeCollaborateur.statut, "EN_ATTENTE")));
  return lignes.length;
}

/** Responsables possibles à la confirmation : collègues actifs de l'entreprise (ni client du portail, ni comptable externe). */
export async function responsablesDemande(tx: TransactionDrizzle, u: UtilisateurConnecte): Promise<{ id: string; nom: string }[]> {
  if (u.role !== "ADMIN") return [];
  return tx
    .select({ id: utilisateur.id, nom: utilisateur.nomComplet })
    .from(utilisateur)
    .where(and(eq(utilisateur.entrepriseId, u.entrepriseId), eq(utilisateur.statut, "ACTIF"), notInArray(utilisateur.role, [...ROLES_NON_COLLEGUES])))
    .orderBy(utilisateur.nomComplet);
}

async function emailDe(tx: TransactionDrizzle, entrepriseId: string, id: string): Promise<string | null> {
  const [x] = await tx.select({ email: utilisateur.email }).from(utilisateur).where(and(eq(utilisateur.id, id), eq(utilisateur.entrepriseId, entrepriseId), eq(utilisateur.statut, "ACTIF")));
  return x?.email ?? null;
}

/**
 * L'Administrateur confirme la demande : il peut corriger les informations (revalidées comme à la création) puis l'invitation est créée.
 * L'adresse email n'est pas modifiable ici (en cas d'erreur, on refuse et le Manager redépose). Renvoie le jeton pour l'envoi de l'email
 * d'invitation, fait par l'appelant hors transaction.
 */
export async function confirmerDemande(
  tx: TransactionDrizzle,
  u: UtilisateurConnecte,
  demandeId: string,
  saisie: Omit<SaisieNouveauCollaborateur, "email">,
  responsableChoisi: string,
): Promise<{ ok: true; jeton: string; email: string; courriers: Courrier[] } | Echec> {
  if (u.role !== "ADMIN") return { ok: false, erreur: m("Seul l'Administrateur peut confirmer la fiche d'un collaborateur.") };
  if (!(await ressourcesHumainesDisponibles(tx, u.entrepriseId))) return { ok: false, erreur: MESSAGE_ABONNEMENT };
  const [d] = await tx.select().from(demandeCollaborateur).where(and(eq(demandeCollaborateur.id, String(demandeId)), eq(demandeCollaborateur.entrepriseId, u.entrepriseId)));
  if (!d) return { ok: false, erreur: m("Demande introuvable.") };
  if (d.statut !== "EN_ATTENTE") return { ok: false, erreur: m("Cette demande a déjà reçu une réponse.") };

  const v = validerNouveauCollaborateur({ ...saisie, email: d.email }, aujourdhuiDouala());
  if (!v.ok) return v;

  let responsableId: string | undefined;
  if (responsableChoisi) {
    const [r] = await tx
      .select({ id: utilisateur.id })
      .from(utilisateur)
      .where(and(eq(utilisateur.id, responsableChoisi), eq(utilisateur.entrepriseId, u.entrepriseId), eq(utilisateur.statut, "ACTIF"), notInArray(utilisateur.role, [...ROLES_NON_COLLEGUES])));
    if (!r) return { ok: false, erreur: m("Responsable introuvable.") };
    responsableId = r.id;
  }

  const inv = await creerInvitationCollaborateur(tx, u.entrepriseId, v.valeurs, responsableId);
  if (!inv.ok) return inv;
  await tx
    .update(demandeCollaborateur)
    .set({ statut: "CONFIRMEE", decideLe: sql`now()`, decideParId: u.utilisateurId, invitationId: inv.invitationId, poste: v.valeurs.poste, typeContrat: v.valeurs.typeContrat, dateEmbauche: v.valeurs.dateEmbauche, dateFin: v.valeurs.dateFin, dateNaissance: v.valeurs.dateNaissance, responsableId: responsableId ?? null })
    .where(eq(demandeCollaborateur.id, d.id));

  const demandeur = await emailDe(tx, u.entrepriseId, d.demandeParId);
  const { sujet, html } = gabaritDemandeConfirmee({ poste: v.valeurs.poste, email: d.email, base: base() });
  return { ok: true, jeton: inv.jeton, email: d.email, courriers: demandeur ? [{ to: demandeur, sujet, html }] : [] };
}

export async function refuserDemande(tx: TransactionDrizzle, u: UtilisateurConnecte, demandeId: string, motifBrut: string): Promise<{ ok: true; courriers: Courrier[] } | Echec> {
  if (u.role !== "ADMIN") return { ok: false, erreur: m("Seul l'Administrateur peut confirmer la fiche d'un collaborateur.") };
  const motif = motifBrut.trim();
  if (motif.length > 500) return { ok: false, erreur: m("Le motif est limité à 500 caractères.") };
  const [d] = await tx.select().from(demandeCollaborateur).where(and(eq(demandeCollaborateur.id, String(demandeId)), eq(demandeCollaborateur.entrepriseId, u.entrepriseId)));
  if (!d) return { ok: false, erreur: m("Demande introuvable.") };
  if (d.statut !== "EN_ATTENTE") return { ok: false, erreur: m("Cette demande a déjà reçu une réponse.") };
  await tx.update(demandeCollaborateur).set({ statut: "REFUSEE", decideLe: sql`now()`, decideParId: u.utilisateurId, motifRefus: motif || null }).where(eq(demandeCollaborateur.id, d.id));
  const demandeur = await emailDe(tx, u.entrepriseId, d.demandeParId);
  const { sujet, html } = gabaritDemandeRefusee({ poste: d.poste, email: d.email, motif: motif || null, base: base() });
  return { ok: true, courriers: demandeur ? [{ to: demandeur, sujet, html }] : [] };
}

/** Le Manager retire sa propre demande tant qu'elle n'a pas reçu de réponse. */
export async function annulerDemande(tx: TransactionDrizzle, u: UtilisateurConnecte, demandeId: string): Promise<{ ok: true } | Echec> {
  const [d] = await tx.select().from(demandeCollaborateur).where(and(eq(demandeCollaborateur.id, String(demandeId)), eq(demandeCollaborateur.entrepriseId, u.entrepriseId), eq(demandeCollaborateur.demandeParId, u.utilisateurId)));
  if (!d) return { ok: false, erreur: m("Demande introuvable.") };
  if (d.statut !== "EN_ATTENTE") return { ok: false, erreur: m("Cette demande a déjà reçu une réponse.") };
  await tx.update(demandeCollaborateur).set({ statut: "ANNULEE", decideLe: sql`now()`, decideParId: u.utilisateurId }).where(eq(demandeCollaborateur.id, d.id));
  return { ok: true };
}
