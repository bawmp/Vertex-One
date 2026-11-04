"use server";

import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { avecEntreprise } from "@/db/client";
import { recuVente, ligneRecuVente, entreprise } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { validerSeriesChoisies } from "@/lib/produits/series";
import { lireSeries as lireListeSeries } from "@/lib/produits/series-regles";
import { calculerMontants } from "@/lib/facturation/calcul";
import { genererNumeroRecuVente } from "@/lib/facturation/numerotation";
import { genererEcrituresRecuVente } from "@/lib/comptabilite/ecritures";
import { decrementerStockVente } from "@/lib/produits/stock";
import { resoudreClientVente } from "@/lib/facturation/client-document";
import { verifierDepotDocument } from "@/lib/produits/depots";
import { getT } from "@/lib/i18n/langue";
import { contrePasserEcritures, ecrituresDuTicket } from "@/lib/comptabilite/contre-passation";
import { defaireMouvementsDocument, verifierStockSuffisant } from "@/lib/produits/stock";
import { m } from "@/lib/i18n/catalogue";

const CHEMIN = "/app/facturation";

const schemaLigne = z.object({
  produitId: z.string().trim().optional(),
  designation: z.string().trim().min(1),
  quantite: z.coerce.number().positive(),
  prixUnitaire: z.coerce.number().int().nonnegative(),
  tauxTVA: z.coerce.number().min(0).max(100),
});

export type EtatRecuVente = { erreur?: string } | null;

/**
 * Extensions Ventes, Reçus de vente (échange du 2026-09-07) — une vente au
 * comptant, encaissée intégralement à la création : contrairement à
 * creerDevis()/creerBonCommandeVente(), il n'y a pas d'état "brouillon", le
 * Reçu est immédiatement EMISE avec ses écritures et son mouvement de stock.
 * Même vérification NIU obligatoire : ce document est un document financier
 * définitif dès sa création, jamais sans NIU renseigné.
 */
export async function creerRecuVente(_etat: EtatRecuVente, formData: FormData): Promise<EtatRecuVente> {
  const t = await getT();
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte, "FACTURATION", "CREER")) {
    return { erreur: t("Vous n'avez pas le droit de créer un reçu de vente.") };
  }

  const dealId = String(formData.get("dealId") ?? "") || undefined;
  const contactId = String(formData.get("contactId") ?? "") || undefined;
  // Dépôt choisi sur le formulaire (vide = dépôt principal) : vérifié ici, jamais cru tel quel (dépôt actif de CETTE entreprise).
  const verifDepot = await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) => verifierDepotDocument(tx, utilisateurConnecte.entrepriseId, String(formData.get("depotId") ?? "") || undefined));
  if (!verifDepot.ok) return { erreur: t(verifDepot.erreur) };
  const depotChoisi = verifDepot.depotId;

  const moyenPaiement = String(formData.get("moyenPaiement") ?? "");
  const referenceTransaction = String(formData.get("referenceTransaction") ?? "").trim();
  if (!dealId && !contactId) return { erreur: t("Formulaire invalide.") };
  if (!["orange_money", "mtn_momo", "especes", "virement", "manuel"].includes(moyenPaiement)) {
    return { erreur: t("Moyen de paiement invalide.") };
  }

  const lignesBrutes = formData.getAll("designation").map((_, i) => ({
    produitId: formData.getAll("produitId")[i] || undefined,
    designation: formData.getAll("designation")[i],
    quantite: formData.getAll("quantite")[i],
    prixUnitaire: formData.getAll("prixUnitaire")[i],
    tauxTVA: formData.getAll("tauxTVA")[i],
  }));
  const analyseLignes = z.array(schemaLigne).min(1, m("Au moins une ligne est requise.")).safeParse(lignesBrutes);
  if (!analyseLignes.success) {
    return { erreur: analyseLignes.error.issues[0]?.message ?? t("Formulaire invalide.") };
  }
  const lignes = analyseLignes.data;
  const montants = calculerMontants(lignes);

  // Numéros de série choisis (un champ par ligne, même position que la ligne) : contrôlés avant toute écriture.
  const seriesBrutes = formData.getAll("seriesChoisies").map((v) => String(v ?? ""));
  const seriesChoisies: Record<string, string[]> = {};
  const demandesSeries: { produitId: string; quantite: number; numeros: string[] }[] = [];
  lignes.forEach((l, i) => {
    const lecture = lireListeSeries(seriesBrutes[i] ?? "");
    if (!l.produitId || lecture.numeros.length === 0) return;
    seriesChoisies[l.produitId] = [...(seriesChoisies[l.produitId] ?? []), ...lecture.numeros];
    demandesSeries.push({ produitId: l.produitId, quantite: l.quantite, numeros: lecture.numeros });
  });
  if (demandesSeries.length > 0) {
    const refus = await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) => validerSeriesChoisies(tx, utilisateurConnecte.entrepriseId, demandesSeries));
    if (refus) return { erreur: t(refus) };
  }

  // « Interdire la vente en rupture » : refus clair AVANT toute écriture quand le dépôt n'a pas assez d'un produit suivi.
  const manque = await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) => verifierStockSuffisant(tx, utilisateurConnecte.entrepriseId, lignes, depotChoisi));
  if (manque) return { erreur: t(manque.cle, manque.valeurs) };

  const [nouveauRecu] = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [monEntreprise] = await tx.select({ niu: entreprise.niu }).from(entreprise).where(eq(entreprise.id, utilisateurConnecte.entrepriseId));
    if (!monEntreprise.niu) {
      throw new Error("NIU_MANQUANT");
    }

    const client = await resoudreClientVente(tx, utilisateurConnecte, { dealId, contactId });
    if (!client) throw new Error("CLIENT_INTROUVABLE");

    const numero = await genererNumeroRecuVente(tx, utilisateurConnecte.entrepriseId);
    const dateEmission = new Date();

    const [recu] = await tx
      .insert(recuVente)
      .values({
        depotId: depotChoisi,
        entrepriseId: utilisateurConnecte.entrepriseId,
        numero,
        dealId: client.dealId,
        contactId: client.contactId,
        compteId: client.compteId,
        assigneAId: client.assigneAId,
        dateEmission,
        montantHT: montants.montantHT,
        montantTVA: montants.montantTVA,
        montantTTC: montants.montantTTC,
        moyenPaiement: moyenPaiement as "orange_money" | "mtn_momo" | "especes" | "virement" | "manuel",
        referenceTransaction: referenceTransaction || undefined,
        creeParId: utilisateurConnecte.utilisateurId,
      })
      .returning({ id: recuVente.id });

    await tx.insert(ligneRecuVente).values(
      lignes.map((l) => ({
        entrepriseId: utilisateurConnecte.entrepriseId,
        recuVenteId: recu.id,
        produitId: l.produitId,
        designation: l.designation,
        quantite: l.quantite,
        prixUnitaire: l.prixUnitaire,
        tauxTVA: l.tauxTVA,
      }))
    );

    await decrementerStockVente(tx, utilisateurConnecte.entrepriseId, lignes, { documentType: "RECU_VENTE", documentId: recu.id, utilisateurId: utilisateurConnecte.utilisateurId, depotId: depotChoisi, seriesChoisies });

    await genererEcrituresRecuVente(tx, {
      id: recu.id,
      entrepriseId: utilisateurConnecte.entrepriseId,
      numero,
      dateEmission,
      montantHT: montants.montantHT,
      montantTVA: montants.montantTVA,
      montantTTC: montants.montantTTC,
      moyenPaiement,
    });

    return [recu];
  }).catch((erreur) => {
    if (erreur instanceof Error && (erreur.message === "NIU_MANQUANT" || erreur.message === "CLIENT_INTROUVABLE")) return [];
    throw erreur;
  });

  if (!nouveauRecu) {
    return { erreur: t("Complétez d'abord le NIU de votre entreprise (Paramètres > Informations légales), ou le client indiqué est introuvable.") };
  }

  revalidatePath(CHEMIN);
  redirect(CHEMIN);
}

/**
 * Comme annulerFacture()/annulerBonCommandeAchat() : aucune contre-passation
 * des écritures d'origine (simplification assumée dans tout ce module), le
 * Reçu reste consultable mais son statut passe à ANNULE.
 */
export async function annulerRecuVente(recuVenteId: string) {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte, "FACTURATION", "MODIFIER")) return;

  await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const annules = await tx
      .update(recuVente)
      .set({ statut: "ANNULE" })
      .where(and(eq(recuVente.id, recuVenteId), eq(recuVente.statut, "EMISE")))
      .returning({ id: recuVente.id, numero: recuVente.numero });
    if (annules.length === 0) return;
    // Annuler défait vraiment la vente : écritures contre-passées (remboursement de la trésorerie) et articles remis en stock.
    await contrePasserEcritures(tx, utilisateurConnecte.entrepriseId, ecrituresDuTicket(recuVenteId), `Ticket ${annules[0].numero}`);
    await defaireMouvementsDocument(tx, utilisateurConnecte.entrepriseId, "RECU_VENTE", recuVenteId, utilisateurConnecte.utilisateurId);
  });

  revalidatePath(CHEMIN);
}
