import { and, eq, inArray } from "drizzle-orm";
import type { TransactionDrizzle } from "@/db/client";
import {
  abonnementPush,
  clearanceDepart,
  demandeConge,
  demandeDepart,
  documentRH,
  dossierRH,
  evaluation,
  invitation,
  mission,
  notePersonnelle,
  paiementSalaire,
  pointage,
  preferenceNotification,
  prime,
  regularisationPointage,
  revisionSalaire,
  stagiaireAcademique,
  tachePoste,
  utilisateur,
} from "@/db/schema";
import { m } from "@/lib/i18n/catalogue";
import { MESSAGE_SALAIRE_DEJA_PAYE } from "./suppression-fiche-libelles";
import { retirerCompteEnBase } from "./retrait-compte";

export type ResultatSuppressionFiche = { ok: true; fichiers: string[] } | { ok: false; erreur: string };

/**
 * Efface DÉFINITIVEMENT la fiche d'un collaborateur (Manager ou Employé, ce qui inclut un stagiaire embauché) et retire son accès.
 * Réservé à l'Administrateur (vérifié par l'appelant) ; tout est relu en base avec l'entreprise de la session.
 *
 * Effacé : la fiche RH et tout ce qui en dépend (congés, présences et régularisations, évaluations, historique de salaire, primes, demandes de départ et
 * clearances, documents RH), la fiche de stage d'origine s'il a été embauché, ses tâches du poste, ses missions, sa note personnelle, ses appareils de
 * notification ; sa photo ; le compte (voir `retirerCompteEnBase`).
 * Gardé : la ligne `utilisateur` (nom) pour que ses tâches, documents, messages, factures et écritures passés gardent leur auteur.
 * Refusé : un Administrateur, un compte déjà supprimé, et toute personne à qui un salaire a déjà été payé (la fiche reste l'archive de ces paiements).
 *
 * Renvoie les clés des fichiers stockés (documents RH, photos) : l'appelant les efface dans R2 APRÈS la transaction — jamais d'appel réseau dedans.
 */
export async function supprimerFicheCollaborateur(tx: TransactionDrizzle, entrepriseId: string, utilisateurId: string): Promise<ResultatSuppressionFiche> {
  // `utilisateur` est en RLS permissive : le filtre sur l'entreprise est explicite.
  const [cible] = await tx
    .select({ role: utilisateur.role, statut: utilisateur.statut, email: utilisateur.email, photo: utilisateur.photoCleStockage })
    .from(utilisateur)
    .where(and(eq(utilisateur.id, String(utilisateurId ?? "")), eq(utilisateur.entrepriseId, entrepriseId)));
  if (!cible || cible.statut === "SUPPRIME") return { ok: false, erreur: m("Compte introuvable.") };
  if (cible.role !== "MANAGER" && cible.role !== "EMPLOYE") return { ok: false, erreur: m("Seule la fiche d'un Manager ou d'un Employé peut être supprimée ici.") };

  const fichiers: string[] = [];
  if (cible.photo) fichiers.push(cible.photo);

  const [dossier] = await tx.select({ id: dossierRH.id }).from(dossierRH).where(and(eq(dossierRH.utilisateurId, utilisateurId), eq(dossierRH.entrepriseId, entrepriseId)));
  if (dossier) {
    const [paye] = await tx.select({ id: paiementSalaire.id }).from(paiementSalaire).where(and(eq(paiementSalaire.dossierRHId, dossier.id), eq(paiementSalaire.entrepriseId, entrepriseId))).limit(1);
    if (paye) return { ok: false, erreur: MESSAGE_SALAIRE_DEJA_PAYE };

    const docs = await tx.select({ cle: documentRH.cleStockage }).from(documentRH).where(and(eq(documentRH.dossierRHId, dossier.id), eq(documentRH.entrepriseId, entrepriseId)));
    for (const d of docs) fichiers.push(d.cle);

    const demandes = await tx.select({ id: demandeDepart.id }).from(demandeDepart).where(and(eq(demandeDepart.dossierRHId, dossier.id), eq(demandeDepart.entrepriseId, entrepriseId)));
    if (demandes.length > 0) await tx.delete(clearanceDepart).where(and(inArray(clearanceDepart.demandeDepartId, demandes.map((d) => d.id)), eq(clearanceDepart.entrepriseId, entrepriseId)));
    for (const table of [demandeDepart, demandeConge, pointage, regularisationPointage, evaluation, revisionSalaire, prime, documentRH]) {
      await tx.delete(table).where(and(eq(table.dossierRHId, dossier.id), eq(table.entrepriseId, entrepriseId)));
    }
    await tx.delete(dossierRH).where(and(eq(dossierRH.id, dossier.id), eq(dossierRH.entrepriseId, entrepriseId)));
  }

  // La fiche de stage d'origine (un stagiaire embauché est un employé) : l'invitation envoyée à cette adresse la relie à la fiche.
  const invitations = await tx.select({ id: invitation.id }).from(invitation).where(and(eq(invitation.entrepriseId, entrepriseId), eq(invitation.email, cible.email)));
  if (invitations.length > 0) {
    const stages = await tx
      .select({ id: stagiaireAcademique.id, photo: stagiaireAcademique.photoCleStockage })
      .from(stagiaireAcademique)
      .where(and(eq(stagiaireAcademique.entrepriseId, entrepriseId), inArray(stagiaireAcademique.invitationId, invitations.map((i) => i.id))));
    for (const s of stages) if (s.photo) fichiers.push(s.photo);
    if (stages.length > 0) await tx.delete(stagiaireAcademique).where(and(eq(stagiaireAcademique.entrepriseId, entrepriseId), inArray(stagiaireAcademique.id, stages.map((s) => s.id))));
  }

  // Ce qui n'appartient qu'à cette personne.
  await tx.delete(tachePoste).where(and(eq(tachePoste.utilisateurId, utilisateurId), eq(tachePoste.entrepriseId, entrepriseId)));
  await tx.delete(mission).where(and(eq(mission.utilisateurId, utilisateurId), eq(mission.entrepriseId, entrepriseId)));
  await tx.delete(notePersonnelle).where(and(eq(notePersonnelle.utilisateurId, utilisateurId), eq(notePersonnelle.entrepriseId, entrepriseId)));
  await tx.delete(abonnementPush).where(and(eq(abonnementPush.utilisateurId, utilisateurId), eq(abonnementPush.entrepriseId, entrepriseId)));
  await tx.delete(preferenceNotification).where(and(eq(preferenceNotification.utilisateurId, utilisateurId), eq(preferenceNotification.entrepriseId, entrepriseId)));

  await tx.update(utilisateur).set({ photoCleStockage: null, photoTypeMime: null }).where(and(eq(utilisateur.id, utilisateurId), eq(utilisateur.entrepriseId, entrepriseId)));
  await retirerCompteEnBase(tx, entrepriseId, utilisateurId, cible.email);
  return { ok: true, fichiers };
}
