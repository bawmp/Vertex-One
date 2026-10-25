import "server-only";
import { after } from "next/server";
import { eq, and } from "drizzle-orm";
import { db, avecEntreprise, type TransactionDrizzle } from "@/db/client";
import { compteClient, contact, entreprise, facture, paiement, tentativePaiementAbonnement, tentativePaiementFacture, utilisateur } from "@/db/schema";
import { prochaineEcheanceApresPaiement } from "@/lib/abonnement/etat";
import { genererEcrituresPaiement } from "@/lib/comptabilite/ecritures";
import { moyenPaiementDepuisOperateur, verifierTransaction } from "@/lib/aangaraa/client";
import { gabaritPaiementAbonnement, gabaritPaiementFactureRecu, gabaritRecuPaiementClient } from "@/lib/email/gabarits";
import { enteteLogoEmail } from "@/lib/email/logo";
import { journaliserEmailEnvoye, resumePiecesJointes } from "@/lib/crm/journaliser-email";
import { obtenirOuCreerLien, urlPubliqueFacture } from "@/lib/client-documents/liens";
import { recupererFacturePourClient } from "@/lib/pdf/donnees";
import { adressesAAlerter, alerterParEmail, echapper } from "@/lib/notifications/equipe";
import { envoyerEmail } from "@/lib/email/client";
import { rendreDocumentCommercialPDF, rendreRecuAbonnementPDF } from "@/lib/pdf/rendu";
import { lireSolde, statutApresReglement } from "@/lib/facturation/solde";
import { lireReferenceExterne } from "./reference";
import type { ResultatVerification } from "./types";

function urlBase(): string {
  return process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
}

/** "Orange_Cameroon" → "Mobile Money (Orange)" — reçu uniquement, jamais réutilisé pour une décision applicative. */
function libelleMoyenPaiement(operateur: string | undefined): string {
  if (!operateur) return "Mobile Money";
  if (/orange/i.test(operateur)) return "Mobile Money (Orange)";
  if (/mtn/i.test(operateur)) return "Mobile Money (MTN)";
  return "Mobile Money";
}

/**
 * Notifie les Administrateurs actifs du résultat d'un paiement d'abonnement — quel que soit le chemin qui a
 * confirmé/invalidé le paiement (sondage client, webhook, réconciliation serveur), pour qu'un client qui a quitté
 * l'écran de paiement soit informé sans devoir y revenir (2026-09-23). Best-effort : un échec d'envoi (Resend non
 * configuré, etc.) ne doit jamais faire échouer la confirmation elle-même, seulement être journalisé.
 *
 * Sur un succès, joint le reçu PDF (Vertex One → tenant, filigrane du logo officiel — voir recu-abonnement.tsx) :
 * le même document que celui téléchargeable depuis la Console interne (src/app/plateforme/entreprises/[id]/), pour
 * que le tenant en garde une trace sans devoir la redemander.
 */
async function notifierResultatPaiementAbonnement(
  tx: TransactionDrizzle,
  entrepriseId: string,
  nomEntreprise: string,
  reussi: boolean,
  recu?: { reference: string; montant: number; operateur: string | undefined; dateConfirmation: Date }
) {
  const admins = await tx
    .select({ email: utilisateur.email })
    .from(utilisateur)
    .where(and(eq(utilisateur.entrepriseId, entrepriseId), eq(utilisateur.role, "ADMIN"), eq(utilisateur.statut, "ACTIF")));

  const { subject, html } = gabaritPaiementAbonnement({ reussi, nomEntreprise, lienPaiement: `${urlBase()}/app/parametres/abonnement` });

  let attachments: { filename: string; content: Buffer }[] | undefined;
  if (reussi && recu) {
    try {
      const buffer = await rendreRecuAbonnementPDF({
        reference: recu.reference,
        nomEntreprisePayeuse: nomEntreprise,
        montant: recu.montant,
        moyenPaiement: libelleMoyenPaiement(recu.operateur),
        dateConfirmation: recu.dateConfirmation,
      });
      attachments = [{ filename: `recu-${recu.reference}.pdf`, content: buffer }];
    } catch (erreur) {
      console.error("[paiement] échec de génération du reçu PDF d'abonnement :", erreur instanceof Error ? erreur.message : erreur);
    }
  }

  for (const admin of admins) {
    const { envoye, erreur } = await envoyerEmail({ to: admin.email, subject, html, attachments });
    if (!envoye) console.error(`[paiement] échec d'envoi de la notification d'abonnement à ${admin.email} :`, erreur);
  }
}

export type IssueNotification = { code: number; message: string };

/**
 * Traite une notification de paiement (route publique, sans session, appelée par les serveurs du prestataire).
 *
 * Rien de ce qui arrive dans la requête n'est cru — le prestataire ne signe pas ses notifications : seul le `payToken` sert à
 * savoir QUOI relire, puis la transaction est relue serveur-à-serveur (statut, montant, notre référence). Le statut, le montant
 * et la référence viennent de CETTE relecture, jamais de la notification. Le format du `payToken` est validé avant tout appel.
 *
 * Idempotent : le prestataire peut rappeler plusieurs fois pour une même transaction — une tentative n'est confirmée qu'une fois.
 */
export async function traiterNotificationPaiement(entree: { payToken: string | null }): Promise<IssueNotification> {
  if (!entree.payToken) return { code: 400, message: "paytoken manquant ou invalide" };

  const verification = await verifierTransaction(entree.payToken);
  // Prestataire injoignable ou clé refusée : un code d'erreur le fait rappeler plus tard, au lieu de perdre le paiement.
  if (verification.indisponible) return { code: 503, message: "vérification indisponible" };

  const cible = lireReferenceExterne(verification.referenceExterne);
  if (!cible) return { code: 404, message: "transaction inconnue" };

  if (cible.nature === "FACTURE") await confirmerTentativeFacture(cible.id, verification);
  else await confirmerTentativeAbonnement(cible.id, verification);
  return { code: 200, message: "OK" };
}

/** Le montant payé chez le prestataire doit être celui de la tentative : un écart n'est jamais confirmé. */
function montantConforme(verification: ResultatVerification, montantAttendu: number): boolean {
  return verification.montant === undefined || verification.montant === montantAttendu;
}

async function confirmerTentativeFacture(idTentative: string, verification: ResultatVerification) {
  let notification: NotificationPaiementFacture | null = null;
  // Lecture anonyme (aucune session) — n'aboutit que grâce à la policy RLS de lecture permissive dédiée à cette table quand
  // app.entreprise_id n'est pas positionné (même patron que `invitation`, voir src/db/schema.ts).
  const [anonyme] = await db.select().from(tentativePaiementFacture).where(eq(tentativePaiementFacture.id, idTentative));
  if (!anonyme) return;
  const entrepriseId = anonyme.entrepriseId;

  await avecEntreprise(entrepriseId, async (tx) => {
    const [tentative] = await tx.select().from(tentativePaiementFacture).where(eq(tentativePaiementFacture.id, idTentative));
    if (!tentative || tentative.statut === "CONFIRME") return;

    if (verification.statut === "REFUSED") {
      await tx.update(tentativePaiementFacture).set({ statut: "ECHEC", raisonEchec: verification.raisonEchec ?? null }).where(eq(tentativePaiementFacture.id, idTentative));
      return;
    }
    if (verification.statut !== "ACCEPTED") return; // PENDING/INCONNU — le prestataire rappellera
    if (!montantConforme(verification, tentative.montant)) {
      console.error(`[paiement] montant inattendu pour la tentative ${idTentative} : ${verification.montant} au lieu de ${tentative.montant}`);
      return;
    }

    const [laFacture] = await tx.select().from(facture).where(eq(facture.id, tentative.factureId));
    if (!laFacture || laFacture.statut === "PAYEE" || laFacture.statut === "ANNULEE") {
      // Déjà réglée par un autre moyen entre-temps (pointage manuel) — tentative marquée confirmée, sans dupliquer le paiement.
      await tx.update(tentativePaiementFacture).set({ statut: "CONFIRME", confirmeLe: new Date() }).where(eq(tentativePaiementFacture.id, idTentative));
      return;
    }

    const moyenPaiement = moyenPaiementDepuisOperateur(verification.operateur);
    const datePaiement = new Date();

    const [nouveauPaiement] = await tx
      .insert(paiement)
      .values({ entrepriseId, factureId: tentative.factureId, montant: tentative.montant, moyenPaiement, referenceTransaction: idTentative, datePaiement })
      .returning({ id: paiement.id });

    // Paiement en plusieurs fois : la facture n'est « payée » que lorsque le total des règlements atteint son montant ; une tranche la
    // laisse « partiellement payée » (ou « en retard » si elle l'était déjà). Chaque tranche a son règlement et ses écritures.
    const { paye } = await lireSolde(tx, tentative.factureId, laFacture.montantTTC);
    await tx.update(facture).set({ statut: statutApresReglement(laFacture.statut, laFacture.montantTTC, paye) }).where(eq(facture.id, tentative.factureId));
    await tx.update(tentativePaiementFacture).set({ statut: "CONFIRME", confirmeLe: datePaiement }).where(eq(tentativePaiementFacture.id, idTentative));

    // Notification à l'Administrateur (envoyée APRÈS la transaction) : seulement quand CET appel vient d'enregistrer le règlement —
    // jamais pour un rappel du prestataire sur une tentative déjà confirmée (le test de statut CONFIRME plus haut coupe court).
    const [leContact] = laFacture.contactId ? await tx.select({ nom: contact.nom, email: contact.email }).from(contact).where(eq(contact.id, laFacture.contactId)) : [];
    const [leCompte] = !leContact && laFacture.compteId ? await tx.select({ nom: compteClient.nom }).from(compteClient).where(eq(compteClient.id, laFacture.compteId)) : [];
    notification = {
      entrepriseId,
      adresses: await adressesAAlerter(tx, entrepriseId),
      nomClient: leContact?.nom ?? leCompte?.nom ?? "Un client",
      emailClient: leContact?.email?.trim() || null,
      numeroFacture: laFacture.numero,
      factureId: tentative.factureId,
      contactId: laFacture.contactId,
      montant: tentative.montant,
      moyen: libelleMoyenPaiement(verification.operateur),
      resteAPayer: Math.max(0, laFacture.montantTTC - paye),
    };

    await genererEcrituresPaiement(tx, {
      entrepriseId,
      factureId: tentative.factureId,
      paiementId: nouveauPaiement.id,
      numeroFacture: laFacture.numero,
      montant: tentative.montant,
      moyenPaiement,
      datePaiement,
    });
  });
  if (notification) notifierSansBloquer(notification);
}

type NotificationPaiementFacture = { entrepriseId: string; adresses: string[]; nomClient: string; emailClient: string | null; numeroFacture: string; factureId: string; contactId: string | null; montant: number; moyen: string; resteAPayer: number };

/** Envoi après la réponse quand on est dans une requête (le client ne l'attend jamais), directement sinon (worker, test). Jamais d'erreur remontée. */
function notifierSansBloquer(n: NotificationPaiementFacture): void {
  const envoyer = async () => {
    try {
      const { subject, html } = gabaritPaiementFactureRecu({
        nomClient: echapper(n.nomClient),
        numeroFacture: echapper(n.numeroFacture),
        montant: n.montant,
        moyen: n.moyen,
        resteAPayer: n.resteAPayer,
        lien: `${urlBase()}/app/facturation/factures/${n.factureId}`,
        clientSansEmail: !n.emailClient,
      });
      await alerterParEmail(n.adresses, subject, html);
    } catch (erreur) {
      console.error("[paiement] échec de la notification de paiement de facture :", erreur instanceof Error ? erreur.message : erreur);
    }
    try {
      await envoyerRecuAuClient(n);
    } catch (erreur) {
      console.error("[paiement] échec de l'envoi du reçu au client :", erreur instanceof Error ? erreur.message : erreur);
    }
  };
  try {
    after(envoyer);
  } catch {
    void envoyer();
  }
}

/**
 * Le client reçoit, après CHAQUE paiement (totalité ou tranche), un email au nom de l'entreprise (logo en tête) avec la facture à jour
 * en PDF (« Déjà réglé », « Reste à payer »). Sans adresse email dans sa fiche, rien ne part (l'Administrateur en est informé dans sa
 * propre notification). Les données sont relues APRÈS la transaction de confirmation : le PDF montre donc bien ce paiement.
 */
async function envoyerRecuAuClient(n: NotificationPaiementFacture): Promise<void> {
  if (!n.emailClient) return;

  const donnees = await avecEntreprise(n.entrepriseId, async (tx) => {
    const d = await recupererFacturePourClient(tx, n.entrepriseId, n.factureId);
    if (!d) return null;
    return { d, jeton: await obtenirOuCreerLien(tx, n.entrepriseId, { factureId: n.factureId }) };
  });
  if (!donnees) return;
  const { d, jeton } = donnees;

  const pdf = await rendreDocumentCommercialPDF({
    typeDocument: "FACTURE",
    numero: d.facture.numero,
    dateEmission: d.facture.dateEmission,
    dateEcheanceOuValidite: d.facture.dateEcheance,
    labelDateSecondaire: "Date d'échéance",
    entreprise: d.entreprise,
    client: d.client,
    lignes: d.lignes,
    montantHT: d.facture.montantHT,
    montantTVA: d.facture.montantTVA,
    montantTTC: d.facture.montantTTC,
    montantRegle: d.paye,
  });

  const { subject, html } = gabaritRecuPaiementClient({
    nomClient: echapper(n.nomClient),
    nomEntreprise: echapper(d.entreprise.nom),
    numeroFacture: echapper(n.numeroFacture),
    montant: n.montant,
    moyen: n.moyen,
    resteAPayer: d.solde,
    lien: urlPubliqueFacture(jeton),
  });
  const corps = (await enteteLogoEmail(n.entrepriseId)) + html;
  const piecesJointes = [{ filename: `${d.facture.numero}.pdf`, content: pdf }];

  const { envoye, erreur } = await envoyerEmail({ to: n.emailClient, subject, html: corps, attachments: piecesJointes, nomExpediteur: d.entreprise.nom });
  if (!envoye) {
    console.error(`[paiement] reçu non envoyé au client de la facture ${n.numeroFacture} :`, erreur);
    return;
  }
  if (n.contactId) {
    await avecEntreprise(n.entrepriseId, (tx) =>
      journaliserEmailEnvoye(tx, {
        entrepriseId: n.entrepriseId,
        contactId: n.contactId!,
        auteurId: null,
        sujet: subject,
        souche: { destinataire: n.emailClient!, html: corps, piecesJointes: resumePiecesJointes(piecesJointes), type: "FACTURE" },
      })
    );
  }
}

async function confirmerTentativeAbonnement(idTentative: string, verification: ResultatVerification) {
  const [anonyme] = await db.select().from(tentativePaiementAbonnement).where(eq(tentativePaiementAbonnement.id, idTentative));
  if (!anonyme) return;
  const entrepriseId = anonyme.entrepriseId;

  await avecEntreprise(entrepriseId, async (tx) => {
    const [tentative] = await tx.select().from(tentativePaiementAbonnement).where(eq(tentativePaiementAbonnement.id, idTentative));
    if (!tentative || tentative.statut === "CONFIRME") return;

    if (verification.statut === "REFUSED") {
      await tx.update(tentativePaiementAbonnement).set({ statut: "ECHEC", raisonEchec: verification.raisonEchec ?? null }).where(eq(tentativePaiementAbonnement.id, idTentative));
      const [monEntreprise] = await tx.select({ nom: entreprise.nom }).from(entreprise).where(eq(entreprise.id, entrepriseId));
      if (monEntreprise) await notifierResultatPaiementAbonnement(tx, entrepriseId, monEntreprise.nom, false);
      return;
    }
    if (verification.statut !== "ACCEPTED") return;
    if (!montantConforme(verification, tentative.montant)) {
      console.error(`[paiement] montant inattendu pour l'abonnement ${idTentative} : ${verification.montant} au lieu de ${tentative.montant}`);
      return;
    }

    const [monEntreprise] = await tx.select({ nom: entreprise.nom, abonnementEcheanceLe: entreprise.abonnementEcheanceLe }).from(entreprise).where(eq(entreprise.id, entrepriseId));
    if (!monEntreprise) return;

    const nouvelleEcheance = prochaineEcheanceApresPaiement(monEntreprise.abonnementEcheanceLe, new Date());
    const dateConfirmation = new Date();

    // statutAbonnement repasse à "actif" immédiatement — un tenant suspendu retrouve l'accès à l'instant où le paiement est
    // confirmé, pas le lendemain via la vérification planifiée. dernierRappelAbonnementEnvoye remis à null pour repartir
    // propre sur le nouveau cycle.
    await tx
      .update(entreprise)
      .set({ abonnementEcheanceLe: nouvelleEcheance, statutAbonnement: "actif", dernierRappelAbonnementEnvoye: null })
      .where(eq(entreprise.id, entrepriseId));
    await tx.update(tentativePaiementAbonnement).set({ statut: "CONFIRME", confirmeLe: dateConfirmation }).where(eq(tentativePaiementAbonnement.id, idTentative));
    await notifierResultatPaiementAbonnement(tx, entrepriseId, monEntreprise.nom, true, {
      reference: idTentative,
      montant: tentative.montant,
      operateur: verification.operateur,
      dateConfirmation,
    });
  });
}

export type StatutRelectureAbonnement = "CONFIRME" | "ECHEC" | "EN_ATTENTE" | "INTROUVABLE" | "INDISPONIBLE";

/**
 * Relecture ACTIVE du statut d'une tentative d'abonnement (paiement direct, 2026-09-22) : contrairement au webhook
 * (une seule fois, immédiatement, transaction encore PENDING — jamais rappelé quand le client valide réellement sur
 * son téléphone), cette fonction relit VRAIMENT le statut chez Aangaraa Pay via le payToken conservé sur la tentative
 * à sa création. Réutilise EXACTEMENT la même logique de confirmation que le webhook (confirmerTentativeAbonnement)
 * — idempotente, un appel répété une fois déjà confirmé ne fait rien. Appelée en sondage depuis l'interface
 * (voir src/lib/actions/abonnement.ts) : aucune session ici, l'appelant vérifie déjà que la tentative lui appartient.
 */
export async function relireEtConfirmerAbonnement(idTentative: string): Promise<StatutRelectureAbonnement> {
  const [anonyme] = await db.select().from(tentativePaiementAbonnement).where(eq(tentativePaiementAbonnement.id, idTentative));
  if (!anonyme) return "INTROUVABLE";
  if (anonyme.statut === "CONFIRME") return "CONFIRME";
  if (anonyme.statut === "ECHEC") return "ECHEC";
  if (!anonyme.payToken) return "EN_ATTENTE"; // rien à relire pour l'instant (réponse initiale sans payToken exploitable)

  const verification = await verifierTransaction(anonyme.payToken);
  if (verification.indisponible) return "INDISPONIBLE";

  await confirmerTentativeAbonnement(idTentative, verification);

  const [apres] = await db.select({ statut: tentativePaiementAbonnement.statut }).from(tentativePaiementAbonnement).where(eq(tentativePaiementAbonnement.id, idTentative));
  if (apres?.statut === "CONFIRME") return "CONFIRME";
  if (apres?.statut === "ECHEC") return "ECHEC";
  return "EN_ATTENTE";
}

/**
 * Relecture ACTIVE du statut d'une tentative de paiement de FACTURE (paiement direct, 2026-10-25) : même principe et même logique
 * de confirmation que pour l'abonnement (voir relireEtConfirmerAbonnement), idempotente. Appelée en sondage depuis la page du
 * client et le bouton interne, et par la réconciliation serveur quand le client a fermé sa page. Aucune session ici : l'appelant
 * vérifie d'abord que la tentative appartient bien à la facture / à l'entreprise concernée.
 */
export async function relireEtConfirmerFacture(idTentative: string): Promise<StatutRelectureAbonnement> {
  const [anonyme] = await db.select().from(tentativePaiementFacture).where(eq(tentativePaiementFacture.id, idTentative));
  if (!anonyme) return "INTROUVABLE";
  if (anonyme.statut === "CONFIRME") return "CONFIRME";
  if (anonyme.statut === "ECHEC") return "ECHEC";
  if (!anonyme.payToken) return "EN_ATTENTE"; // rien à relire pour l'instant (réponse initiale sans payToken exploitable)

  const verification = await verifierTransaction(anonyme.payToken);
  if (verification.indisponible) return "INDISPONIBLE";

  await confirmerTentativeFacture(idTentative, verification);

  const [apres] = await db.select({ statut: tentativePaiementFacture.statut }).from(tentativePaiementFacture).where(eq(tentativePaiementFacture.id, idTentative));
  if (apres?.statut === "CONFIRME") return "CONFIRME";
  if (apres?.statut === "ECHEC") return "ECHEC";
  return "EN_ATTENTE";
}
