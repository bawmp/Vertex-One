"use server";

import { eq, and } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { avecEntreprise } from "@/db/client";
import { factureAcompte, facture, entreprise } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { genererNumeroFactureAcompte } from "@/lib/facturation/numerotation";
import { genererEcrituresPaiementAcompte, genererEcrituresApplicationAcompte } from "@/lib/comptabilite/ecritures";
import { resoudreClientVente, memeClientVente } from "@/lib/facturation/client-document";

const CHEMIN = "/app/facturation";

export type EtatFactureAcompte = { erreur?: string } | null;

/**
 * Extensions Ventes, Factures d'acompte (échange du 2026-09-07) — demande
 * d'avance, rien n'est encore encaissé ni comptabilisé à ce stade (comme un
 * Devis). Même vérification NIU obligatoire que creerDevis() : ce document
 * mène directement à une avance qui sera un jour appliquée sur une vraie
 * Facture.
 */
export async function creerFactureAcompte(_etat: EtatFactureAcompte, formData: FormData): Promise<EtatFactureAcompte> {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte.role, "FACTURATION", "CREER")) {
    return { erreur: "Vous n'avez pas le droit de créer une facture d'acompte." };
  }

  const dealId = String(formData.get("dealId") ?? "") || undefined;
  const contactId = String(formData.get("contactId") ?? "") || undefined;
  const montant = Number(formData.get("montant"));
  if (!dealId && !contactId) return { erreur: "Formulaire invalide." };
  if (!Number.isInteger(montant) || montant <= 0) return { erreur: "Le montant doit être un entier positif." };

  const [nouvelAcompte] = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [monEntreprise] = await tx.select({ niu: entreprise.niu }).from(entreprise).where(eq(entreprise.id, utilisateurConnecte.entrepriseId));
    if (!monEntreprise.niu) {
      throw new Error("NIU_MANQUANT");
    }

    const client = await resoudreClientVente(tx, utilisateurConnecte, { dealId, contactId });
    if (!client) throw new Error("CLIENT_INTROUVABLE");

    const numero = await genererNumeroFactureAcompte(tx, utilisateurConnecte.entrepriseId);

    const [acompte] = await tx
      .insert(factureAcompte)
      .values({
        entrepriseId: utilisateurConnecte.entrepriseId,
        numero,
        dealId: client.dealId,
        contactId: client.contactId,
        compteId: client.compteId,
        assigneAId: client.assigneAId,
        montant,
        montantRestant: montant,
        creeParId: utilisateurConnecte.utilisateurId,
      })
      .returning({ id: factureAcompte.id });

    return [acompte];
  }).catch((erreur) => {
    if (erreur instanceof Error && (erreur.message === "NIU_MANQUANT" || erreur.message === "CLIENT_INTROUVABLE")) return [];
    throw erreur;
  });

  if (!nouvelAcompte) {
    return { erreur: "Complétez d'abord le NIU de votre entreprise (Paramètres > Informations légales), ou le client indiqué est introuvable." };
  }

  revalidatePath(CHEMIN);
  redirect(CHEMIN);
}

/**
 * Encaissement de l'acompte — bascule EMISE → PAYEE, comptabilisé comme une
 * dette envers le client (419100) plutôt qu'une vente, tant qu'il n'est pas
 * appliqué sur une vraie Facture.
 */
export async function enregistrerPaiementFactureAcompte(_etat: EtatFactureAcompte, formData: FormData): Promise<EtatFactureAcompte> {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte.role, "FACTURATION", "MODIFIER")) {
    return { erreur: "Vous n'avez pas le droit d'encaisser une facture d'acompte." };
  }

  const factureAcompteId = String(formData.get("factureAcompteId") ?? "");
  const moyenPaiement = String(formData.get("moyenPaiement") ?? "");
  const referenceTransaction = String(formData.get("referenceTransaction") ?? "").trim();
  if (!factureAcompteId) return { erreur: "Formulaire invalide." };
  if (!["orange_money", "mtn_momo", "especes", "virement", "manuel"].includes(moyenPaiement)) {
    return { erreur: "Moyen de paiement invalide." };
  }

  const dealId = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const dateEncaissement = new Date();
    const [acompte] = await tx
      .update(factureAcompte)
      .set({
        statut: "PAYEE",
        moyenPaiement: moyenPaiement as "orange_money" | "mtn_momo" | "especes" | "virement" | "manuel",
        referenceTransaction: referenceTransaction || undefined,
        dateEncaissement,
      })
      .where(and(eq(factureAcompte.id, factureAcompteId), eq(factureAcompte.statut, "EMISE")))
      .returning({ id: factureAcompte.id, entrepriseId: factureAcompte.entrepriseId, numero: factureAcompte.numero, montant: factureAcompte.montant, dealId: factureAcompte.dealId });
    if (!acompte) return null;

    await genererEcrituresPaiementAcompte(tx, {
      id: acompte.id,
      entrepriseId: acompte.entrepriseId,
      numero: acompte.numero,
      dateEncaissement,
      montant: acompte.montant,
      moyenPaiement,
    });

    return acompte.dealId;
  });

  if (!dealId) return { erreur: "Cette facture d'acompte n'est plus en attente de paiement." };

  revalidatePath(`/app/deals/${dealId}`);
  revalidatePath(CHEMIN);
  return null;
}

/**
 * Applique un acompte encaissé sur une Facture émise du même Deal.
 * Simplification connue (voir schema.ts) : n'autorise l'application que si
 * montantRestant couvre intégralement facture.montantTTC — pas de paiement
 * partiel d'une Facture, cohérent avec le reste de ce module.
 */
export async function appliquerAcompteSurFacture(factureAcompteId: string, factureId: string) {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte.role, "FACTURATION", "MODIFIER")) return;

  const dealId = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [acompte] = await tx.select().from(factureAcompte).where(and(eq(factureAcompte.id, factureAcompteId), eq(factureAcompte.statut, "PAYEE")));
    if (!acompte) return null;

    const [laFacture] = await tx.select().from(facture).where(and(eq(facture.id, factureId), eq(facture.statut, "EMISE")));
    if (!laFacture) return null;
    if (!memeClientVente(acompte, laFacture)) return null;
    if (acompte.montantRestant < laFacture.montantTTC) return null;

    const dateApplication = new Date();
    const montantRestantApres = acompte.montantRestant - laFacture.montantTTC;

    await tx
      .update(factureAcompte)
      .set({ montantRestant: montantRestantApres, statut: montantRestantApres === 0 ? "APPLIQUEE" : "PAYEE" })
      .where(eq(factureAcompte.id, acompte.id));

    await tx.update(facture).set({ statut: "PAYEE" }).where(eq(facture.id, laFacture.id));

    await genererEcrituresApplicationAcompte(tx, {
      entrepriseId: utilisateurConnecte.entrepriseId,
      factureAcompteId: acompte.id,
      factureId: laFacture.id,
      numeroFactureAcompte: acompte.numero,
      numeroFacture: laFacture.numero,
      montant: laFacture.montantTTC,
      dateApplication,
    });

    return acompte.dealId;
  });

  revalidatePath(CHEMIN);
  if (dealId) revalidatePath(`/app/deals/${dealId}`);
}

/**
 * Uniquement depuis EMISE — une fois encaissé, annuler nécessiterait un
 * remboursement réel, hors périmètre de cette tranche.
 */
export async function annulerFactureAcompte(factureAcompteId: string) {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte.role, "FACTURATION", "MODIFIER")) return;

  const dealId = await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) =>
    tx
      .update(factureAcompte)
      .set({ statut: "ANNULEE" })
      .where(and(eq(factureAcompte.id, factureAcompteId), eq(factureAcompte.statut, "EMISE")))
      .returning({ dealId: factureAcompte.dealId })
      .then((rows) => rows[0]?.dealId ?? null)
  );

  revalidatePath(CHEMIN);
  if (dealId) revalidatePath(`/app/deals/${dealId}`);
}
