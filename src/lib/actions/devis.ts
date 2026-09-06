"use server";

import { z } from "zod";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { avecEntreprise } from "@/db/client";
import { entreprise, devis, ligneDevis, facture, ligneFacture, deal, contact } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { calculerMontants, formaterFCFA } from "@/lib/facturation/calcul";
import { genererNumeroDevis, genererNumeroFacture } from "@/lib/facturation/numerotation";
import { recupererDevisPourPDF } from "@/lib/pdf/donnees";
import { rendreDocumentCommercialPDF } from "@/lib/pdf/rendu";
import { envoyerEmail } from "@/lib/email/client";
import { recupererModele, interpoler, corpsVersHtml } from "@/lib/email/modeles";
import { creerProjetDepuisDevisAccepte } from "@/lib/projets/pont";
import { genererEcrituresFactureEmise } from "@/lib/comptabilite/ecritures";

const schemaLigne = z.object({
  designation: z.string().trim().min(1),
  quantite: z.coerce.number().positive(),
  prixUnitaire: z.coerce.number().int().nonnegative(),
  tauxTVA: z.coerce.number().min(0).max(100),
});

export type EtatDevis = { erreur?: string } | null;

/**
 * Bloque la création tant que le NIU n'est pas renseigné (docs/palier-1-*,
 * section 2) — sans lui, aucun devis émis ne serait conforme DGI. Le numéro
 * n'est PAS généré ici : un devis reste un brouillon jusqu'à son envoi, et
 * la numérotation ne concerne que les factures (section 5). On donne quand
 * même un numéro de brouillon lisible ("DEV-2026-000042") dès la création
 * pour l'affichage — voir note dans le code : à distinguer du numéro de
 * FACTURE, seul soumis à la contrainte stricte de séquence sans trou.
 */
export async function creerDevis(_etat: EtatDevis, formData: FormData): Promise<EtatDevis> {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte.role, "FACTURATION", "CREER")) {
    return { erreur: "Vous n'avez pas le droit de créer un devis." };
  }

  const dealId = String(formData.get("dealId") ?? "");
  const dateValidite = String(formData.get("dateValidite") ?? "");

  const lignesBrutes = formData.getAll("designation").map((_, i) => ({
    designation: formData.getAll("designation")[i],
    quantite: formData.getAll("quantite")[i],
    prixUnitaire: formData.getAll("prixUnitaire")[i],
    tauxTVA: formData.getAll("tauxTVA")[i],
  }));

  const analyseLignes = z.array(schemaLigne).min(1, "Au moins une ligne est requise.").safeParse(lignesBrutes);
  if (!analyseLignes.success || !dealId || !dateValidite) {
    return { erreur: analyseLignes.success ? "Formulaire invalide." : analyseLignes.error.issues[0]?.message };
  }

  const lignes = analyseLignes.data;
  const montants = calculerMontants(lignes);

  const [nouveauDevis] = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [monEntreprise] = await tx.select({ niu: entreprise.niu }).from(entreprise).where(eq(entreprise.id, utilisateurConnecte.entrepriseId));
    if (!monEntreprise.niu) {
      throw new Error("NIU_MANQUANT");
    }

    const numero = await genererNumeroDevis(tx, utilisateurConnecte.entrepriseId);

    const [ligneDevisCree] = await tx
      .insert(devis)
      .values({
        entrepriseId: utilisateurConnecte.entrepriseId,
        numero,
        dealId,
        dateValidite: new Date(dateValidite),
        montantHT: montants.montantHT,
        montantTVA: montants.montantTVA,
        montantTTC: montants.montantTTC,
        creeParId: utilisateurConnecte.utilisateurId,
      })
      .returning({ id: devis.id });

    await tx.insert(ligneDevis).values(
      lignes.map((l) => ({
        entrepriseId: utilisateurConnecte.entrepriseId,
        devisId: ligneDevisCree.id,
        designation: l.designation,
        quantite: l.quantite,
        prixUnitaire: l.prixUnitaire,
        tauxTVA: l.tauxTVA,
      }))
    );

    return [ligneDevisCree];
  }).catch((erreur) => {
    if (erreur instanceof Error && erreur.message === "NIU_MANQUANT") return [];
    throw erreur;
  });

  if (!nouveauDevis) {
    return { erreur: "Complétez d'abord le NIU de votre entreprise (Paramètres > Informations légales)." };
  }

  redirect(`/app/facturation/devis/${nouveauDevis.id}`);
}

/**
 * Devis accepté → facture créée automatiquement dans le même mouvement
 * (docs/palier-1-*, section 6, étape 4), numéro de facture généré à cet
 * instant précis (jamais avant) via genererNumeroFacture(), dans la même
 * transaction que l'insertion — un échec de l'insertion annule aussi
 * l'incrémentation du compteur, donc jamais de trou dans la séquence.
 */
export async function accepterDevis(devisId: string) {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte.role, "FACTURATION", "MODIFIER")) return;

  const idFactureCreee = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [leDevis] = await tx.select().from(devis).where(eq(devis.id, devisId));
    if (!leDevis || leDevis.statut === "ACCEPTE") return null;

    const [lignesDuDevis, [leDeal], [monEntreprise]] = await Promise.all([
      tx.select().from(ligneDevis).where(eq(ligneDevis.devisId, devisId)),
      tx.select({ contactId: deal.contactId }).from(deal).where(eq(deal.id, leDevis.dealId)),
      tx.select({ secteurProfil: entreprise.secteurProfil }).from(entreprise).where(eq(entreprise.id, utilisateurConnecte.entrepriseId)),
    ]);
    if (!leDeal) return null; // intégrité référentielle violée — ne devrait jamais arriver

    const [leContact] = await tx.select({ nom: contact.nom }).from(contact).where(eq(contact.id, leDeal.contactId));

    await tx.update(devis).set({ statut: "ACCEPTE" }).where(eq(devis.id, devisId));

    const numero = await genererNumeroFacture(tx, utilisateurConnecte.entrepriseId);
    const dateEcheance = new Date();
    dateEcheance.setDate(dateEcheance.getDate() + 30);

    const [nouvelleFacture] = await tx
      .insert(facture)
      .values({
        entrepriseId: utilisateurConnecte.entrepriseId,
        numero,
        dealId: leDevis.dealId,
        devisOrigineId: leDevis.id,
        montantHT: leDevis.montantHT,
        montantTVA: leDevis.montantTVA,
        montantTTC: leDevis.montantTTC,
        dateEcheance,
      })
      .returning({ id: facture.id });

    await tx.insert(ligneFacture).values(
      lignesDuDevis.map((l) => ({
        entrepriseId: utilisateurConnecte.entrepriseId,
        factureId: nouvelleFacture.id,
        designation: l.designation,
        quantite: l.quantite,
        prixUnitaire: l.prixUnitaire,
        tauxTVA: l.tauxTVA,
      }))
    );

    // Palier 4, section 4 : la comptabilité se construit toute seule à
    // mesure que l'entreprise facture — jamais un écran de saisie séparé à
    // ouvrir pour ses ventes courantes. Génération non conditionnée au
    // forfait (comme le pont Dossier/Projet ci-dessous) : seule la
    // consultation des écritures est verrouillée au forfait Business.
    await genererEcrituresFactureEmise(tx, {
      id: nouvelleFacture.id,
      entrepriseId: utilisateurConnecte.entrepriseId,
      numero,
      dateEmission: new Date(),
      montantHT: leDevis.montantHT,
      montantTVA: leDevis.montantTVA,
      montantTTC: leDevis.montantTTC,
    });

    // Palier 2, section 3 : ouverture (ou réutilisation) du Dossier client
    // et création d'un nouveau Projet, dans la même transaction que la
    // facture — un échec de l'un annule l'autre, jamais de facture sans son
    // Projet de suivi ni l'inverse.
    await creerProjetDepuisDevisAccepte(tx, {
      entrepriseId: utilisateurConnecte.entrepriseId,
      contactId: leDeal.contactId,
      contactNom: leContact?.nom ?? "Client",
      secteurProfil: monEntreprise?.secteurProfil ?? "generique",
      devisId: leDevis.id,
      numeroDevis: leDevis.numero,
      // Celui qui a créé le devis (donc gagné le client), pas forcément
      // celui qui clique sur "Marquer accepté" — voir docs/palier-2-*, section 3.
      responsableId: leDevis.creeParId,
    });

    return nouvelleFacture.id;
  });

  revalidatePath(`/app/facturation/devis/${devisId}`);
  revalidatePath("/app/facturation");
  revalidatePath("/app/projets");
  revalidatePath("/app");

  if (idFactureCreee) redirect(`/app/facturation/factures/${idFactureCreee}`);
}

export type EtatEnvoiDevis = { erreur?: string; envoye?: boolean } | null;

/**
 * Envoi réel par email (Resend), pièce jointe PDF générée à la volée —
 * WhatsApp reste un TODO (API Meta Cloud non configurée, même traitement que
 * les autres intégrations externes de ce projet). Le statut ne passe à
 * ENVOYE que si l'email part effectivement : un échec (client sans email,
 * Resend indisponible) ne doit jamais laisser croire au client interne que
 * le devis est parti.
 */
export async function envoyerDevis(devisId: string, _etat: EtatEnvoiDevis, _formData: FormData): Promise<EtatEnvoiDevis> {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte.role, "FACTURATION", "MODIFIER")) {
    return { erreur: "Vous n'avez pas le droit d'envoyer ce devis." };
  }

  const resultat = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const donnees = await recupererDevisPourPDF(tx, utilisateurConnecte, devisId);
    if (!donnees) return { erreur: "Devis introuvable." };
    if (!donnees.client?.email) {
      return { erreur: "Ce client n'a pas d'adresse email renseignée (voir sa fiche CRM)." };
    }

    const [modele, buffer] = await Promise.all([
      recupererModele(tx, utilisateurConnecte.entrepriseId, "ENVOI_DEVIS"),
      rendreDocumentCommercialPDF({
        typeDocument: "DEVIS",
        numero: donnees.devis.numero,
        dateEmission: donnees.devis.creeLe,
        dateEcheanceOuValidite: donnees.devis.dateValidite,
        labelDateSecondaire: "Valide jusqu'au",
        entreprise: donnees.entreprise,
        client: donnees.client,
        lignes: donnees.lignes,
        montantHT: donnees.devis.montantHT,
        montantTVA: donnees.devis.montantTVA,
        montantTTC: donnees.devis.montantTTC,
      }),
    ]);

    const variables = {
      client: donnees.client.nom,
      numero: donnees.devis.numero,
      montant: formaterFCFA(donnees.devis.montantTTC),
      entreprise: donnees.entreprise.nom,
    };

    const { envoye, erreur } = await envoyerEmail({
      to: donnees.client.email,
      subject: interpoler(modele.objet, variables),
      html: corpsVersHtml(interpoler(modele.corps, variables)),
      attachments: [{ filename: `${donnees.devis.numero}.pdf`, content: buffer }],
    });

    if (!envoye) return { erreur: erreur ?? "Échec de l'envoi de l'email." };

    await tx.update(devis).set({ statut: "ENVOYE" }).where(eq(devis.id, devisId));
    return { envoye: true };
  });

  revalidatePath(`/app/facturation/devis/${devisId}`);
  return resultat;
}
