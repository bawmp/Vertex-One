"use server";

import { z } from "zod";
import { and, eq, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { envoyerBulletinParEmail } from "@/lib/rh/bulletin-email";
import { avecEntreprise } from "@/db/client";
import { dossierRH, prime } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { getT } from "@/lib/i18n/langue";
import { m } from "@/lib/i18n/catalogue";
import { enregistrerPaiementSalaire, marquerBulletinEnvoye, modifierBulletinBrouillon } from "@/lib/rh/paie";
import { jourValide, lireRetenues, moisValide, MODES_PAIEMENT, TYPES_PRIME } from "@/lib/rh/paie-regles";

export type EtatPaie = { erreur?: string; ok?: boolean; paiementId?: string } | null;

/**
 * Primes et paiements de salaire : réservés à l'Administrateur (le rôle vient de la session signée, jamais du formulaire). Le dossier
 * est relu avec l'entreprise de la session : un identifiant d'une autre entreprise ne renvoie rien (RLS + filtre explicite).
 */
async function administrateur() {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  return utilisateurConnecte.role === "ADMIN" ? utilisateurConnecte : null;
}

const schemaPrime = z.object({
  dossierRHId: z.string().min(1),
  type: z.enum(TYPES_PRIME.map((x) => x.cle) as [string, ...string[]], { message: m("Choisissez un type de prime.") }),
  montant: z.coerce.number().int(m("Le montant doit être un nombre entier.")).positive(m("Le montant doit être positif.")).max(100_000_000, m("Montant trop élevé.")),
  moisConcerne: z.string().refine(moisValide, m("Choisissez le mois concerné.")),
  motif: z.string().trim().max(200).optional(),
});

export async function ajouterPrime(_etat: EtatPaie, formData: FormData): Promise<EtatPaie> {
  const t = await getT();
  const moi = await administrateur();
  if (!moi) return { erreur: t("Seul l'Administrateur peut accorder une prime.") };

  const analyse = schemaPrime.safeParse({
    dossierRHId: formData.get("dossierRHId"),
    type: formData.get("type"),
    montant: formData.get("montant"),
    moisConcerne: formData.get("moisConcerne"),
    motif: formData.get("motif") || undefined,
  });
  if (!analyse.success) return { erreur: t(analyse.error.issues[0]?.message ?? m("Formulaire invalide.")) };
  const d = analyse.data;

  const retour = await avecEntreprise(moi.entrepriseId, async (tx) => {
    const [dossier] = await tx.select({ id: dossierRH.id }).from(dossierRH).where(and(eq(dossierRH.id, d.dossierRHId), eq(dossierRH.entrepriseId, moi.entrepriseId)));
    if (!dossier) return { erreur: t("Dossier RH introuvable.") };
    await tx.insert(prime).values({ entrepriseId: moi.entrepriseId, dossierRHId: d.dossierRHId, type: d.type, montant: d.montant, moisConcerne: d.moisConcerne, motif: d.motif || null, saisieParId: moi.utilisateurId });
    return null;
  });
  if (retour) return retour;

  revalidatePath(`/app/rh/${d.dossierRHId}`);
  revalidatePath("/app/rh/primes");
  return { ok: true };
}

/** Retire une prime pas encore payée. Une prime rattachée à un bulletin ne se supprime plus (trace comptable). */
export async function supprimerPrime(formData: FormData): Promise<void> {
  const moi = await administrateur();
  const id = String(formData.get("id") ?? "");
  if (!moi || !id) return;
  const dossierId = await avecEntreprise(moi.entrepriseId, async (tx) => {
    const [supprimee] = await tx.delete(prime).where(and(eq(prime.id, id), eq(prime.entrepriseId, moi.entrepriseId), isNull(prime.paiementSalaireId))).returning({ dossierRHId: prime.dossierRHId });
    return supprimee?.dossierRHId ?? null;
  });
  if (dossierId) revalidatePath(`/app/rh/${dossierId}`);
  revalidatePath("/app/rh/primes");
}

const schemaPaiement = z.object({
  dossierRHId: z.string().min(1),
  mois: z.string().refine(moisValide, m("Choisissez le mois payé.")),
  datePaiement: z.string().refine(jourValide, m("Date de paiement invalide.")),
  modePaiement: z.enum(MODES_PAIEMENT.map((x) => x.cle) as [string, ...string[]], { message: m("Choisissez le mode de paiement.") }),
});

/** Enregistre le paiement du salaire d'un mois : le bulletin de paie est généré dans la même opération. */
export async function payerSalaire(_etat: EtatPaie, formData: FormData): Promise<EtatPaie> {
  const t = await getT();
  const moi = await administrateur();
  if (!moi) return { erreur: t("Seul l'Administrateur peut enregistrer un paiement de salaire.") };

  const analyse = schemaPaiement.safeParse({
    dossierRHId: formData.get("dossierRHId"),
    mois: formData.get("mois"),
    datePaiement: formData.get("datePaiement"),
    modePaiement: formData.get("modePaiement"),
  });
  if (!analyse.success) return { erreur: t(analyse.error.issues[0]?.message ?? m("Formulaire invalide.")) };
  const lecture = lireRetenues((nom) => String(formData.get(nom) ?? ""));
  if (lecture.erreur) return { erreur: t(lecture.erreur) };
  const d = analyse.data;

  const resultat = await avecEntreprise(moi.entrepriseId, (tx) =>
    enregistrerPaiementSalaire(tx, { entrepriseId: moi.entrepriseId, dossierRHId: d.dossierRHId, mois: d.mois, datePaiement: d.datePaiement, modePaiement: d.modePaiement, retenues: lecture.retenues, payeParId: moi.utilisateurId })
  );
  if (!resultat.ok) return { erreur: t(resultat.erreur) };

  revalidatePath(`/app/rh/${d.dossierRHId}`);
  revalidatePath("/app/rh/primes");
  return { ok: true, paiementId: resultat.id };
}

const schemaModification = z.object({
  paiementId: z.string().min(1),
  datePaiement: z.string().refine(jourValide, m("Date de paiement invalide.")),
  modePaiement: z.enum(MODES_PAIEMENT.map((x) => x.cle) as [string, ...string[]], { message: m("Choisissez le mode de paiement.") }),
});

/** Corrige un bulletin avant son envoi (date, mode, retenues). Impossible une fois le bulletin envoyé. */
export async function modifierBulletin(_etat: EtatPaie, formData: FormData): Promise<EtatPaie> {
  const t = await getT();
  const moi = await administrateur();
  if (!moi) return { erreur: t("Seul l'Administrateur peut modifier un bulletin.") };
  const analyse = schemaModification.safeParse({ paiementId: formData.get("paiementId"), datePaiement: formData.get("datePaiement"), modePaiement: formData.get("modePaiement") });
  if (!analyse.success) return { erreur: t(analyse.error.issues[0]?.message ?? m("Formulaire invalide.")) };
  const lecture = lireRetenues((nom) => String(formData.get(nom) ?? ""));
  if (lecture.erreur) return { erreur: t(lecture.erreur) };
  const d = analyse.data;

  const resultat = await avecEntreprise(moi.entrepriseId, (tx) => modifierBulletinBrouillon(tx, { entrepriseId: moi.entrepriseId, paiementId: d.paiementId, datePaiement: d.datePaiement, modePaiement: d.modePaiement, retenues: lecture.retenues }));
  if (!resultat.ok) return { erreur: t(resultat.erreur) };
  revalidatePath(`/app/rh/${resultat.dossierRHId}`);
  return { ok: true };
}

/** Envoie le bulletin à la personne payée (email avec le PDF, après la réponse) et le fige. Peut être renvoyé : la date du premier envoi reste. */
export async function envoyerBulletin(_etat: EtatPaie, formData: FormData): Promise<EtatPaie> {
  const t = await getT();
  const moi = await administrateur();
  if (!moi) return { erreur: t("Seul l'Administrateur peut envoyer un bulletin.") };
  const paiementId = String(formData.get("paiementId") ?? "");
  if (!paiementId) return { erreur: t("Formulaire invalide.") };

  const marque = await avecEntreprise(moi.entrepriseId, (tx) => marquerBulletinEnvoye(tx, moi.entrepriseId, paiementId));
  if (!marque) return { erreur: t("Bulletin introuvable.") };
  after(() => envoyerBulletinParEmail(moi.entrepriseId, marque.dossierRHId, paiementId));
  revalidatePath(`/app/rh/${marque.dossierRHId}`);
  return { ok: true };
}
