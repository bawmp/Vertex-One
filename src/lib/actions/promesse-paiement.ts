"use server";

import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { avecEntreprise } from "@/db/client";
import { facture, promessePaiement } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { idsVisibles } from "@/lib/portee";
import { enregistrerPromesse } from "@/lib/facturation/promesse";
import { aujourdhuiDouala, CANAUX_PROMESSE, noteNettoyee, verifierDatePromesse, type CanalPromesse } from "@/lib/facturation/promesse-regles";
import { getT } from "@/lib/i18n/langue";
import { m } from "@/lib/i18n/catalogue";

export type EtatPromesse = { erreur?: string } | null;

/**
 * Note une promesse de paiement faite par un client (au téléphone, sur WhatsApp, en rendez-vous…) pour une facture. Toute personne
 * qui peut MODIFIER la facturation, dans sa portée : la facture est relue en base avec l'entreprise de la session (jamais un
 * identifiant pris tel quel), et sa portée (propre / équipe / tout) est vérifiée comme pour le reste de la facturation. Tant que la
 * promesse court, la relance automatique de la facture est suspendue ; une promesse déjà en cours est remplacée (gardée dans
 * l'historique). Le montant promis ne dépasse jamais le solde restant.
 */
export async function noterPromesse(factureId: string, _etat: EtatPromesse, formData: FormData): Promise<EtatPromesse> {
  const t = await getT();
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte, "FACTURATION", "MODIFIER")) {
    return { erreur: t("Vous n'avez pas le droit de modifier cette facture.") };
  }

  const datePromise = String(formData.get("datePromise") ?? "");
  const erreurDate = verifierDatePromesse(datePromise, aujourdhuiDouala());
  if (erreurDate) return { erreur: t(erreurDate) };

  const canal = String(formData.get("canal") ?? "");
  if (!(CANAUX_PROMESSE as readonly string[]).includes(canal)) return { erreur: t(m("Choisissez comment le client vous l'a annoncé.")) };

  const brut = formData.get("montant");
  const note = noteNettoyee(formData.get("note"));

  let resultat;
  try {
    resultat = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
      const visibles = await idsVisibles(tx, utilisateurConnecte, "FACTURATION");
      const [laFacture] = await tx.select({ assigneAId: facture.assigneAId }).from(facture).where(and(eq(facture.id, factureId), eq(facture.entrepriseId, utilisateurConnecte.entrepriseId)));
      if (!laFacture || (visibles !== "TOUT" && !visibles.includes(laFacture.assigneAId))) return { erreur: m("Cette facture est introuvable.") };

      return enregistrerPromesse(tx, {
        entrepriseId: utilisateurConnecte.entrepriseId,
        factureId,
        datePromise,
        montant: typeof brut === "string" && brut.trim() !== "" ? brut.trim() : undefined,
        canal: canal as CanalPromesse,
        source: "EQUIPE",
        note,
        creeParId: utilisateurConnecte.utilisateurId,
        clientIp: null,
      });
    });
  } catch (erreur) {
    // Deux enregistrements simultanés : l'index unique partiel (une seule promesse en cours par facture) en refuse un.
    console.error("[promesse] enregistrement impossible :", erreur instanceof Error ? erreur.message : erreur);
    return { erreur: t(m("Une autre promesse vient d'être enregistrée pour cette facture. Réessayez.")) };
  }
  if ("erreur" in resultat) return { erreur: t(resultat.erreur) };

  revalidatePath(`/app/facturation/factures/${factureId}`);
  revalidatePath("/app/facturation");
  if (resultat.contactId) revalidatePath(`/app/contacts/${resultat.contactId}`);
  return null;
}

/** Retire la promesse en cours d'une facture (le client a changé d'avis, saisie par erreur). Même droit et même portée que pour la noter. */
export async function annulerPromesse(factureId: string): Promise<EtatPromesse> {
  const t = await getT();
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte, "FACTURATION", "MODIFIER")) {
    return { erreur: t("Vous n'avez pas le droit de modifier cette facture.") };
  }

  const annulee = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const visibles = await idsVisibles(tx, utilisateurConnecte, "FACTURATION");
    const [laFacture] = await tx.select({ assigneAId: facture.assigneAId }).from(facture).where(and(eq(facture.id, factureId), eq(facture.entrepriseId, utilisateurConnecte.entrepriseId)));
    if (!laFacture || (visibles !== "TOUT" && !visibles.includes(laFacture.assigneAId))) return false;
    const lignes = await tx
      .update(promessePaiement)
      .set({ statut: "ANNULEE", resolueLe: new Date() })
      .where(and(eq(promessePaiement.entrepriseId, utilisateurConnecte.entrepriseId), eq(promessePaiement.factureId, factureId), eq(promessePaiement.statut, "EN_COURS")))
      .returning({ id: promessePaiement.id });
    return lignes.length > 0;
  });
  if (!annulee) return { erreur: t(m("Aucune promesse en cours pour cette facture.")) };

  revalidatePath(`/app/facturation/factures/${factureId}`);
  revalidatePath("/app/facturation");
  return null;
}
