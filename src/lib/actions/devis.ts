"use server";

import { z } from "zod";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { avecEntreprise } from "@/db/client";
import { entreprise, devis, ligneDevis } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { calculerMontants, formaterFCFA } from "@/lib/facturation/calcul";
import { genererNumeroDevis } from "@/lib/facturation/numerotation";
import { resoudreClientVente } from "@/lib/facturation/client-document";
import { recupererDevisPourPDF } from "@/lib/pdf/donnees";
import { rendreDocumentCommercialPDF } from "@/lib/pdf/rendu";
import { envoyerEmail } from "@/lib/email/client";
import { recupererModele, interpoler, corpsVersHtml } from "@/lib/email/modeles";
import { accepterDevisEtCreerFacture } from "@/lib/facturation/acceptation-devis";
import { obtenirOuCreerLien, urlPubliqueDevis } from "@/lib/client-documents/liens";

const schemaLigne = z.object({
  produitId: z.string().trim().optional(),
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
  if (!peut(utilisateurConnecte, "FACTURATION", "CREER")) {
    return { erreur: "Vous n'avez pas le droit de créer un devis." };
  }

  const dealId = String(formData.get("dealId") ?? "") || undefined;
  const contactId = String(formData.get("contactId") ?? "") || undefined;
  const dateValidite = String(formData.get("dateValidite") ?? "");

  const lignesBrutes = formData.getAll("designation").map((_, i) => ({
    produitId: formData.getAll("produitId")[i] || undefined,
    designation: formData.getAll("designation")[i],
    quantite: formData.getAll("quantite")[i],
    prixUnitaire: formData.getAll("prixUnitaire")[i],
    tauxTVA: formData.getAll("tauxTVA")[i],
  }));

  const analyseLignes = z.array(schemaLigne).min(1, "Au moins une ligne est requise.").safeParse(lignesBrutes);
  if (!analyseLignes.success || (!dealId && !contactId) || !dateValidite) {
    return { erreur: analyseLignes.success ? "Formulaire invalide." : analyseLignes.error.issues[0]?.message };
  }

  const lignes = analyseLignes.data;
  const montants = calculerMontants(lignes);

  const [nouveauDevis] = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [monEntreprise] = await tx.select({ niu: entreprise.niu }).from(entreprise).where(eq(entreprise.id, utilisateurConnecte.entrepriseId));
    if (!monEntreprise.niu) {
      throw new Error("NIU_MANQUANT");
    }

    const client = await resoudreClientVente(tx, utilisateurConnecte, { dealId, contactId });
    if (!client) throw new Error("CLIENT_INTROUVABLE");

    const numero = await genererNumeroDevis(tx, utilisateurConnecte.entrepriseId);

    const [ligneDevisCree] = await tx
      .insert(devis)
      .values({
        entrepriseId: utilisateurConnecte.entrepriseId,
        numero,
        dealId: client.dealId,
        contactId: client.contactId,
        compteId: client.compteId,
        assigneAId: client.assigneAId,
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
        produitId: l.produitId || undefined,
        designation: l.designation,
        quantite: l.quantite,
        prixUnitaire: l.prixUnitaire,
        tauxTVA: l.tauxTVA,
      }))
    );

    return [ligneDevisCree];
  }).catch((erreur) => {
    if (erreur instanceof Error && (erreur.message === "NIU_MANQUANT" || erreur.message === "CLIENT_INTROUVABLE")) return [];
    throw erreur;
  });

  if (!nouveauDevis) {
    return { erreur: "Complétez d'abord le NIU de votre entreprise (Paramètres > Informations légales), ou le client indiqué est introuvable." };
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
  if (!peut(utilisateurConnecte, "FACTURATION", "MODIFIER")) return;

  const idFactureCreee = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    return accepterDevisEtCreerFacture(tx, utilisateurConnecte.entrepriseId, devisId);
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
  if (!peut(utilisateurConnecte, "FACTURATION", "MODIFIER")) {
    return { erreur: "Vous n'avez pas le droit d'envoyer ce devis." };
  }

  const resultat = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const donnees = await recupererDevisPourPDF(tx, utilisateurConnecte, devisId);
    if (!donnees) return { erreur: "Devis introuvable." };
    if (!donnees.client?.email) {
      return { erreur: "Ce client n'a pas d'adresse email renseignée (voir sa fiche CRM)." };
    }

    const jetonClient = await obtenirOuCreerLien(tx, utilisateurConnecte.entrepriseId, { devisId });

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
      html: corpsVersHtml(interpoler(modele.corps, variables)) + `<p><a href="${urlPubliqueDevis(jetonClient)}">Consulter, accepter ou refuser ce devis en ligne</a></p>`,
      attachments: [{ filename: `${donnees.devis.numero}.pdf`, content: buffer }],
    });

    if (!envoye) return { erreur: erreur ?? "Échec de l'envoi de l'email." };

    await tx.update(devis).set({ statut: "ENVOYE" }).where(eq(devis.id, devisId));
    return { envoye: true };
  });

  revalidatePath(`/app/facturation/devis/${devisId}`);
  return resultat;
}
