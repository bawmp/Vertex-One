"use server";

import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { avecEntreprise } from "@/db/client";
import { devis, facture, contact, entreprise } from "@/db/schema";
import {
  obtenirOuCreerLien,
  trouverLien,
  urlPubliqueFacture,
  urlBase,
} from "@/lib/client-documents/liens";
import { accepterDevisEtCreerFacture } from "@/lib/facturation/acceptation-devis";
import { creerLienPaiementFacture } from "@/lib/facturation/paiement-en-ligne";
import { formaterFCFA } from "@/lib/facturation/calcul";
import {
  adressesAAlerter,
  alerterParEmail,
  echapper,
} from "@/lib/notifications/equipe";
import { envoyerEmail } from "@/lib/email/client";

/**
 * Actions du CLIENT depuis son lien public (devis/facture) — aucune session : la
 * seule autorisation est le jeton secret. Rien n'est jamais pris dans la requête
 * en dehors du jeton, de la décision et du motif ; l'entreprise et le document
 * viennent de la ligne du lien. Chaque réponse enregistre sa date et l'adresse IP,
 * lues côté serveur.
 *
 * Les emails (alerte à l'équipe, lien de la facture au client) partent APRÈS la réponse
 * (after()) : le client ne doit jamais attendre un envoi d'email pour voir sa réponse prise en compte.
 */

export type EtatReponseClient = {
  erreur?: string;
  succes?: string;
  factureJeton?: string;
} | null;

async function adresseIP(): Promise<string | null> {
  const enTetes = await headers();
  return (
    enTetes.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    enTetes.get("x-real-ip") ??
    null
  );
}

function motifNettoye(brut: string | undefined): string | null {
  const motif = (brut ?? "").trim().slice(0, 1000);
  return motif || null;
}

export async function repondreDevisPublic(
  jeton: string,
  decision: "ACCEPTER" | "REFUSER",
  motifBrut?: string,
): Promise<EtatReponseClient> {
  if (decision !== "ACCEPTER" && decision !== "REFUSER")
    return { erreur: "Réponse invalide." };
  const lien = await trouverLien(jeton);
  if (!lien?.devisId) return { erreur: "Ce lien n'est pas valide." };
  const devisId = lien.devisId;
  const ip = await adresseIP();
  const motif = motifNettoye(motifBrut);

  const resultat = await avecEntreprise(lien.entrepriseId, async (tx) => {
    const [leDevis] = await tx
      .select()
      .from(devis)
      .where(eq(devis.id, devisId));
    if (!leDevis) return { erreur: "Ce devis est introuvable." };
    if (leDevis.statut === "ACCEPTE")
      return { erreur: "Ce devis a déjà été accepté." };
    if (leDevis.statut === "REFUSE")
      return { erreur: "Ce devis a déjà été refusé." };
    if (leDevis.statut !== "ENVOYE")
      return { erreur: "Ce devis n'est plus disponible." };
    if (leDevis.dateValidite < new Date())
      return {
        erreur:
          "Ce devis a expiré : contactez l'entreprise pour en obtenir un nouveau.",
      };

    const [monEntreprise] = await tx
      .select({ nom: entreprise.nom })
      .from(entreprise)
      .where(eq(entreprise.id, lien.entrepriseId));
    const [leContact] = await tx
      .select({ nom: contact.nom, email: contact.email })
      .from(contact)
      .where(eq(contact.id, leDevis.contactId));
    const destinataires = await adressesAAlerter(tx, lien.entrepriseId, [
      leDevis.assigneAId,
      leDevis.creeParId,
    ]);
    const contexte = {
      numero: leDevis.numero,
      montant: formaterFCFA(leDevis.montantTTC),
      clientNom: leContact?.nom ?? "Le client",
      clientEmail: leContact?.email ?? null,
      entrepriseNom: monEntreprise?.nom ?? "",
    };

    if (decision === "REFUSER") {
      await tx
        .update(devis)
        .set({
          statut: "REFUSE",
          reponseLe: new Date(),
          reponseIP: ip,
          motifRefus: motif,
        })
        .where(eq(devis.id, devisId));
      return { refus: true as const, destinataires, contexte };
    }

    const factureId = await accepterDevisEtCreerFacture(
      tx,
      lien.entrepriseId,
      devisId,
      { ip },
    );
    if (!factureId) return { erreur: "Ce devis n'a pas pu être accepté." };
    const factureJeton = await obtenirOuCreerLien(tx, lien.entrepriseId, {
      factureId,
    });
    const [laFacture] = await tx
      .select({ numero: facture.numero })
      .from(facture)
      .where(eq(facture.id, factureId));
    return {
      accepte: true as const,
      factureJeton,
      numeroFacture: laFacture?.numero ?? "",
      destinataires,
      contexte,
    };
  });

  if ("erreur" in resultat) return { erreur: resultat.erreur };

  const { destinataires, contexte } = resultat;
  if ("refus" in resultat) {
    after(() =>
      alerterParEmail(
        destinataires,
        `Devis ${contexte.numero} refusé par ${contexte.clientNom}`,
        `<p>${echapper(contexte.clientNom)} a <strong>refusé</strong> le devis ${echapper(contexte.numero)} (${contexte.montant}).</p>${motif ? `<p>Motif indiqué : « ${echapper(motif)} »</p>` : "<p>Aucun motif indiqué.</p>"}`,
      ),
    );
    revalidatePath(`/app/facturation/devis/${devisId}`);
    return {
      succes: "Merci pour votre réponse. Nous avons bien noté votre refus.",
    };
  }

  const lienFacture = urlPubliqueFacture(resultat.factureJeton);
  after(() =>
    alerterParEmail(
      destinataires,
      `Devis ${contexte.numero} accepté par ${contexte.clientNom}`,
      `<p>${echapper(contexte.clientNom)} a <strong>accepté</strong> le devis ${echapper(contexte.numero)} (${contexte.montant}).</p><p>La facture ${echapper(resultat.numeroFacture)} a été créée automatiquement.</p>`,
    ),
  );
  // Le client garde de quoi payer plus tard : le lien de sa facture lui est aussi envoyé par email.
  const emailClient = contexte.clientEmail;
  if (emailClient) {
    after(() =>
      envoyerEmail({
        to: emailClient,
        subject: `Votre facture ${resultat.numeroFacture} — ${contexte.entrepriseNom}`,
        html: `<p>Bonjour ${echapper(contexte.clientNom)},</p><p>Merci d'avoir accepté le devis ${echapper(contexte.numero)}. Votre facture ${echapper(resultat.numeroFacture)} (${contexte.montant}) est disponible : vous pouvez la régler maintenant ou plus tard depuis ce lien.</p><p><a href="${lienFacture}">Consulter et payer ma facture</a></p><p>${echapper(contexte.entrepriseNom)}</p>`,
      }).catch(() => undefined),
    );
  }

  revalidatePath(`/app/facturation/devis/${devisId}`);
  revalidatePath("/app/facturation");
  revalidatePath("/app/projets");
  return {
    succes: "Devis accepté. Merci !",
    factureJeton: resultat.factureJeton,
  };
}

export async function repondreFacturePublic(
  jeton: string,
  decision: "ACCEPTER" | "CONTESTER",
  motifBrut?: string,
): Promise<EtatReponseClient> {
  if (decision !== "ACCEPTER" && decision !== "CONTESTER")
    return { erreur: "Réponse invalide." };
  const lien = await trouverLien(jeton);
  if (!lien?.factureId) return { erreur: "Ce lien n'est pas valide." };
  const factureId = lien.factureId;
  const motif = motifNettoye(motifBrut);
  if (decision === "CONTESTER" && !motif)
    return { erreur: "Indiquez brièvement le motif de votre contestation." };

  const resultat = await avecEntreprise(lien.entrepriseId, async (tx) => {
    const [laFacture] = await tx
      .select()
      .from(facture)
      .where(eq(facture.id, factureId));
    if (!laFacture) return { erreur: "Cette facture est introuvable." };
    if (laFacture.statut === "ANNULEE")
      return { erreur: "Cette facture a été annulée." };
    if (laFacture.statut === "PAYEE")
      return { erreur: "Cette facture est déjà réglée." };
    if (laFacture.reponseClient)
      return {
        erreur:
          laFacture.reponseClient === "ACCEPTEE"
            ? "Vous avez déjà accepté cette facture."
            : "Vous avez déjà contesté cette facture.",
      };

    await tx
      .update(facture)
      .set({
        reponseClient: decision === "ACCEPTER" ? "ACCEPTEE" : "CONTESTEE",
        reponseClientLe: new Date(),
        motifContestation: decision === "CONTESTER" ? motif : null,
      })
      .where(
        and(
          eq(facture.id, factureId),
          eq(facture.entrepriseId, lien.entrepriseId),
        ),
      );

    const [leContact] = await tx
      .select({ nom: contact.nom })
      .from(contact)
      .where(eq(contact.id, laFacture.contactId));
    const destinataires = await adressesAAlerter(tx, lien.entrepriseId, [
      laFacture.assigneAId,
    ]);
    return {
      destinataires,
      numero: laFacture.numero,
      montant: formaterFCFA(laFacture.montantTTC),
      clientNom: leContact?.nom ?? "Le client",
    };
  });

  if ("erreur" in resultat) return { erreur: resultat.erreur };

  after(() =>
    alerterParEmail(
      resultat.destinataires,
      decision === "ACCEPTER"
        ? `Facture ${resultat.numero} acceptée par ${resultat.clientNom}`
        : `Facture ${resultat.numero} contestée par ${resultat.clientNom}`,
      decision === "ACCEPTER"
        ? `<p>${echapper(resultat.clientNom)} a <strong>accepté</strong> la facture ${echapper(resultat.numero)} (${resultat.montant}).</p>`
        : `<p>${echapper(resultat.clientNom)} a <strong>contesté</strong> la facture ${echapper(resultat.numero)} (${resultat.montant}).</p><p>Motif : « ${echapper(motif ?? "")} »</p>`,
    ),
  );

  revalidatePath(`/app/facturation/factures/${factureId}`);
  return {
    succes:
      decision === "ACCEPTER"
        ? "Facture acceptée. Merci !"
        : "Votre contestation a bien été transmise. L'entreprise va vous recontacter.",
  };
}

/**
 * Le client paie sa facture depuis son lien : seulement après l'avoir acceptée (le
 * paiement direct n'est proposé qu'à un client qui reconnaît la facture). Renvoie
 * l'URL de paiement Aangaraa Pay — paiement Mobile Money avec reversement différé, jamais
 * présenté comme instantané (voir CLAUDE.md).
 */
export async function payerFacturePublic(
  jeton: string,
): Promise<{ url?: string; erreur?: string }> {
  const lien = await trouverLien(jeton);
  if (!lien?.factureId) return { erreur: "Ce lien n'est pas valide." };
  const factureId = lien.factureId;

  return avecEntreprise(lien.entrepriseId, async (tx) => {
    const [laFacture] = await tx
      .select({ reponseClient: facture.reponseClient, statut: facture.statut })
      .from(facture)
      .where(eq(facture.id, factureId));
    if (!laFacture) return { erreur: "Cette facture est introuvable." };
    if (laFacture.reponseClient !== "ACCEPTEE")
      return { erreur: "Acceptez d'abord la facture pour pouvoir la régler." };
    return creerLienPaiementFacture(tx, {
      entrepriseId: lien.entrepriseId,
      factureId,
      returnUrl: `${urlBase()}/facture/${jeton}`,
    });
  });
}
