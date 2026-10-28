"use server";

import { and, desc, eq, gt, isNotNull } from "drizzle-orm";
import { headers } from "next/headers";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { avecEntreprise } from "@/db/client";
import { devis, facture, contact, entreprise, promessePaiement, tentativePaiementFacture } from "@/db/schema";
import {
  obtenirOuCreerLien,
  trouverLien,
  urlPubliqueFacture,
  urlBase,
} from "@/lib/client-documents/liens";
import { accepterDevisEtCreerFacture } from "@/lib/facturation/acceptation-devis";
import { declencherPaiementDirectFacture } from "@/lib/facturation/paiement-en-ligne";
import { relireEtConfirmerFacture, type StatutRelectureAbonnement } from "@/lib/paiement/confirmation";
import { formaterFCFA } from "@/lib/facturation/calcul";
import {
  adressesAAlerter,
  alerterParEmail,
  echapper,
} from "@/lib/notifications/equipe";
import { envoyerEmail } from "@/lib/email/client";
import { journaliserEmailEnvoye } from "@/lib/crm/journaliser-email";
import { enregistrerPromesse } from "@/lib/facturation/promesse";
import { aujourdhuiDouala, ajouterJours, noteNettoyee, verifierDatePromesse } from "@/lib/facturation/promesse-regles";

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
      contactId: leDevis.contactId,
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
    const sujetFacture = `Votre facture ${resultat.numeroFacture} — ${contexte.entrepriseNom}`;
    const htmlFacture = `<p>Bonjour ${echapper(contexte.clientNom)},</p><p>Merci d'avoir accepté le devis ${echapper(contexte.numero)}. Votre facture ${echapper(resultat.numeroFacture)} (${contexte.montant}) est disponible : vous pouvez la régler maintenant ou plus tard depuis ce lien.</p><p><a href="${lienFacture}">Consulter et payer ma facture</a></p><p>${echapper(contexte.entrepriseNom)}</p>`;
    after(() =>
      envoyerEmail({
        to: emailClient,
        subject: sujetFacture,
        html: htmlFacture,
      })
        .then((r) => {
          if (r.envoye) {
            return avecEntreprise(lien.entrepriseId, (tx) =>
              journaliserEmailEnvoye(tx, { entrepriseId: lien.entrepriseId, contactId: contexte.contactId, auteurId: null, sujet: sujetFacture, souche: { destinataire: emailClient, html: htmlFacture, type: "FACTURE" } }),
            );
          }
        })
        .catch(() => undefined),
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

/** Au plus ce nombre de déclarations de date par heure et par facture : le lien est connu de son destinataire, pas besoin de plus. */
const PROMESSES_CLIENT_MAX_PAR_HEURE = 5;

/**
 * Le client annonce depuis son lien qu'il réglera sa facture à une date donnée (« Je paierai le… »). Mêmes règles que le reste des
 * réponses du client : le jeton est l'unique autorisation, l'entreprise et la facture viennent de la ligne du lien, jamais d'une
 * valeur du navigateur ; la date et l'adresse IP sont enregistrées côté serveur. Seulement après avoir ACCEPTÉ la facture (le client
 * qui la conteste n'annonce pas de paiement), jamais sur une facture réglée ou annulée. La date doit être entre demain et 60 jours.
 * Le montant promis est le solde restant (le client ne choisit pas de montant ici). Une promesse déjà en cours est remplacée. Tant
 * qu'elle court, la relance automatique de la facture est suspendue. L'équipe est prévenue par email APRÈS la réponse (after()) ;
 * le texte saisi par le client est échappé avant d'entrer dans l'email.
 */
export async function promettrePaiementPublic(jeton: string, datePromise: string, noteBrute?: string): Promise<EtatReponseClient> {
  const lien = await trouverLien(jeton);
  if (!lien?.factureId) return { erreur: "Ce lien n'est pas valide." };
  const factureId = lien.factureId;

  const aujourdhui = aujourdhuiDouala();
  const erreurDate = verifierDatePromesse(datePromise, aujourdhui, ajouterJours(aujourdhui, 1));
  if (erreurDate) return { erreur: erreurDate };
  const note = noteNettoyee(noteBrute);
  const ip = await adresseIP();

  const resultat = await avecEntreprise(lien.entrepriseId, async (tx) => {
    const [laFacture] = await tx.select().from(facture).where(eq(facture.id, factureId));
    if (!laFacture) return { erreur: "Cette facture est introuvable." };
    if (laFacture.statut === "ANNULEE") return { erreur: "Cette facture a été annulée." };
    if (laFacture.statut === "PAYEE") return { erreur: "Cette facture est déjà réglée." };
    if (laFacture.reponseClient !== "ACCEPTEE") return { erreur: "Acceptez d'abord la facture pour annoncer une date de paiement." };

    const recentes = await tx
      .select({ id: promessePaiement.id })
      .from(promessePaiement)
      .where(and(eq(promessePaiement.factureId, factureId), eq(promessePaiement.source, "CLIENT"), gt(promessePaiement.creeLe, new Date(Date.now() - 3600_000))));
    if (recentes.length >= PROMESSES_CLIENT_MAX_PAR_HEURE) return { erreur: "Vous avez modifié cette date plusieurs fois : réessayez dans une heure." };

    const enregistree = await enregistrerPromesse(tx, {
      entrepriseId: lien.entrepriseId,
      factureId,
      datePromise,
      canal: "client",
      source: "CLIENT",
      note,
      creeParId: null,
      clientIp: ip,
    });
    if ("erreur" in enregistree) return { erreur: enregistree.erreur };

    return {
      destinataires: await adressesAAlerter(tx, lien.entrepriseId, [laFacture.assigneAId]),
      numero: enregistree.numeroFacture,
      montant: formaterFCFA(enregistree.promesse.montant),
      clientNom: enregistree.nomClient ?? "Le client",
    };
  });
  if ("erreur" in resultat) return { erreur: resultat.erreur };

  const jourLisible = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${datePromise}T00:00:00Z`));
  after(() =>
    alerterParEmail(
      resultat.destinataires,
      `${resultat.clientNom} annonce un paiement le ${jourLisible} — facture ${resultat.numero}`,
      `<p>${echapper(resultat.clientNom)} a annoncé depuis sa page de facture qu'il réglera <strong>${resultat.montant}</strong> (facture ${echapper(resultat.numero)}) le <strong>${jourLisible}</strong>.</p>${note ? `<p>Message : « ${echapper(note)} »</p>` : ""}<p>Les relances automatiques de cette facture sont suspendues jusqu'à cette date ; si le paiement n'arrive pas, elles reprennent et vous en êtes alerté.</p>`
    )
  );

  revalidatePath(`/app/facturation/factures/${factureId}`);
  revalidatePath("/app/facturation");
  return { succes: `C'est noté : vous réglerez cette facture le ${jourLisible}. Merci !` };
}

/**
 * Le client paie sa facture depuis son lien : seulement après l'avoir acceptée (le paiement direct n'est proposé qu'à un client
 * qui reconnaît la facture). Le client peut régler en plusieurs fois (tranches) : il choisit le montant de chaque tranche, jusqu'au solde. Paiement SANS redirection (2026-10-25, comme l'abonnement) : le client saisit son numéro Mobile Money
 * et son opérateur sur la page, une invite part sur son téléphone, puis la page sonde le statut (verifierPaiementFacturePublic).
 * Paiement Mobile Money avec reversement différé, jamais présenté comme instantané (voir CLAUDE.md).
 */
export async function payerFacturePublic(
  jeton: string,
  telephone: string,
  operateur: string,
  montant?: number, // la tranche choisie ; absent = tout le solde. Le serveur la borne toujours (determinerMontantTranche).
): Promise<{ tentativeId?: string; erreur?: string }> {
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
    return declencherPaiementDirectFacture(tx, {
      entrepriseId: lien.entrepriseId,
      factureId,
      returnUrl: `${urlBase()}/facture/${jeton}`,
      telephone,
      operateur,
      montant,
    });
  });
}

/**
 * Sondée par la page du client après le déclenchement : relit activement le statut chez Aangaraa Pay. L'entreprise et la facture
 * viennent du lien (jeton) ; la tentative doit appartenir à CETTE facture, jamais un identifiant pris tel quel.
 */
export async function verifierPaiementFacturePublic(
  jeton: string,
  tentativeId: string,
): Promise<{ statut: StatutRelectureAbonnement; raison: string | null }> {
  const lien = await trouverLien(jeton);
  if (!lien?.factureId) return { statut: "INTROUVABLE", raison: null };
  const factureId = lien.factureId;

  const appartient = await avecEntreprise(lien.entrepriseId, async (tx) => {
    const [t] = await tx
      .select({ id: tentativePaiementFacture.id })
      .from(tentativePaiementFacture)
      .where(and(eq(tentativePaiementFacture.id, tentativeId), eq(tentativePaiementFacture.factureId, factureId)));
    return Boolean(t);
  });
  if (!appartient) return { statut: "INTROUVABLE", raison: null };

  const statut = await relireEtConfirmerFacture(tentativeId);
  if (statut === "CONFIRME") revalidatePath(`/app/facturation/factures/${factureId}`);
  if (statut !== "ECHEC") return { statut, raison: null };
  const raison = await avecEntreprise(lien.entrepriseId, async (tx) => {
    const [t] = await tx.select({ raison: tentativePaiementFacture.raisonEchec }).from(tentativePaiementFacture).where(eq(tentativePaiementFacture.id, tentativeId));
    return t?.raison ?? null;
  });
  return { statut, raison };
}

/**
 * Reprise après rechargement de la page (l'onglet peut être déchargé pendant que le client valide sur son téléphone) : une tentative
 * récente (moins de 10 minutes, avec payToken) encore en attente, pour CETTE facture.
 */
export async function recupererPaiementFactureEnAttentePublic(jeton: string): Promise<{ tentativeId: string } | null> {
  const lien = await trouverLien(jeton);
  if (!lien?.factureId) return null;
  const factureId = lien.factureId;
  return avecEntreprise(lien.entrepriseId, async (tx) => {
    const [t] = await tx
      .select({ id: tentativePaiementFacture.id })
      .from(tentativePaiementFacture)
      .where(
        and(
          eq(tentativePaiementFacture.factureId, factureId),
          eq(tentativePaiementFacture.statut, "EN_ATTENTE"),
          isNotNull(tentativePaiementFacture.payToken),
          gt(tentativePaiementFacture.creeLe, new Date(Date.now() - 10 * 60 * 1000)),
        ),
      )
      .orderBy(desc(tentativePaiementFacture.creeLe))
      .limit(1);
    return t ? { tentativeId: t.id } : null;
  });
}
