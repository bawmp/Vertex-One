import { and, count, eq, inArray, type SQL } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import type { TransactionDrizzle } from "@/db/client";
import {
  lead,
  contact,
  deal,
  dealContact,
  historiqueStatutDeal,
  tacheCrm,
  reunionCrm,
  reponseFormulaire,
  contactChampValeur,
  interaction,
  document,
  demandeSuppressionDocument,
  journalAccesDocument,
  invitation,
  reservation,
  ticketSupport,
  messageTicketSupport,
  utilisateur,
  devis,
  bonCommandeVente,
  facture,
  factureAcompte,
  factureRecurrente,
  recuVente,
  dossier,
  depense,
} from "@/db/schema";
import { m } from "@/lib/i18n/catalogue";

/**
 * Suppression d'un lead, d'un contact ou d'un deal — réservée à l'Administrateur (vérifiée par l'action, voir
 * src/lib/actions/suppression-crm.ts). Aucune clé étrangère du schéma n'est en cascade : chaque dépendance est donc
 * traitée ici explicitement, dans la transaction de l'appelant (tout ou rien).
 *
 * Règle du produit : une facture n'est JAMAIS supprimée, et un devis, un bon de commande, un reçu, un acompte, une
 * facture récurrente, un dossier ou un ticket de support portent obligatoirement leur client. Un contact (ou un deal
 * facturé) qui en porte encore ne peut donc pas disparaître : la suppression est REFUSÉE avec la liste précise de ce
 * qui la bloque, jamais contournée en silence ni faite à moitié.
 */
export type Blocage = { libelle: string; nombre: number };
export type ResultatSuppression = { supprime: true; clesStockage: string[] } | { supprime: false; raison: string; blocages?: Blocage[] };

async function compter(tx: TransactionDrizzle, table: PgTable, condition: SQL | undefined): Promise<number> {
  const [r] = await tx.select({ n: count() }).from(table).where(condition);
  return Number(r?.n ?? 0);
}

function refus(blocages: Blocage[], intro: string): ResultatSuppression {
  const presents = blocages.filter((b) => b.nombre > 0);
  return { supprime: false, raison: intro, blocages: presents };
}

export async function supprimerLeadEnBase(tx: TransactionDrizzle, leadId: string): Promise<ResultatSuppression> {
  const [leLead] = await tx.select({ id: lead.id }).from(lead).where(eq(lead.id, leadId));
  if (!leLead) return { supprime: false, raison: m("Lead introuvable.") };

  // Les tâches et réunions rattachées à ce lead n'ont plus d'objet sans lui ; les réponses de formulaire, elles,
  // sont conservées (donnée de One Form) et simplement détachées.
  await tx.delete(tacheCrm).where(eq(tacheCrm.leadId, leadId));
  await tx.delete(reunionCrm).where(eq(reunionCrm.leadId, leadId));
  await tx.update(reponseFormulaire).set({ leadId: null }).where(eq(reponseFormulaire.leadId, leadId));
  await tx.delete(lead).where(eq(lead.id, leadId));
  return { supprime: true, clesStockage: [] };
}

export async function supprimerDealEnBase(tx: TransactionDrizzle, dealId: string): Promise<ResultatSuppression> {
  const [leDeal] = await tx.select({ id: deal.id }).from(deal).where(eq(deal.id, dealId));
  if (!leDeal) return { supprime: false, raison: m("Deal introuvable.") };

  // Une facture n'est jamais supprimée, ni détachée de son origine commerciale en silence : un deal facturé reste.
  const blocages: Blocage[] = [
    { libelle: m("facture(s)"), nombre: await compter(tx, facture, eq(facture.dealId, dealId)) },
    { libelle: m("facture(s) d'acompte"), nombre: await compter(tx, factureAcompte, eq(factureAcompte.dealId, dealId)) },
    { libelle: m("reçu(s) de vente"), nombre: await compter(tx, recuVente, eq(recuVente.dealId, dealId)) },
    { libelle: m("facture(s) récurrente(s)"), nombre: await compter(tx, factureRecurrente, eq(factureRecurrente.dealId, dealId)) },
  ];
  if (blocages.some((b) => b.nombre > 0)) return refus(blocages, m("Ce deal est lié à des documents comptables qui ne peuvent pas être supprimés."));

  // Devis, bons de commande et dépenses gardent leur client : on les détache seulement de ce deal (lien facultatif).
  await tx.update(devis).set({ dealId: null }).where(eq(devis.dealId, dealId));
  await tx.update(bonCommandeVente).set({ dealId: null }).where(eq(bonCommandeVente.dealId, dealId));
  await tx.update(depense).set({ dealId: null }).where(eq(depense.dealId, dealId));

  await tx.delete(dealContact).where(eq(dealContact.dealId, dealId));
  await tx.delete(historiqueStatutDeal).where(eq(historiqueStatutDeal.dealId, dealId));
  await tx.delete(tacheCrm).where(eq(tacheCrm.dealId, dealId));
  await tx.delete(reunionCrm).where(eq(reunionCrm.dealId, dealId));
  await tx.delete(deal).where(eq(deal.id, dealId));
  return { supprime: true, clesStockage: [] };
}

export async function supprimerContactEnBase(
  tx: TransactionDrizzle,
  params: { entrepriseId: string; auteurId: string; contactId: string }
): Promise<ResultatSuppression> {
  const { entrepriseId, auteurId, contactId } = params;
  const [leContact] = await tx.select().from(contact).where(eq(contact.id, contactId));
  if (!leContact) return { supprime: false, raison: m("Contact introuvable.") };

  const blocages: Blocage[] = [
    { libelle: m("devis"), nombre: await compter(tx, devis, eq(devis.contactId, contactId)) },
    { libelle: m("bon(s) de commande"), nombre: await compter(tx, bonCommandeVente, eq(bonCommandeVente.contactId, contactId)) },
    { libelle: m("facture(s)"), nombre: await compter(tx, facture, eq(facture.contactId, contactId)) },
    { libelle: m("facture(s) d'acompte"), nombre: await compter(tx, factureAcompte, eq(factureAcompte.contactId, contactId)) },
    { libelle: m("reçu(s) de vente"), nombre: await compter(tx, recuVente, eq(recuVente.contactId, contactId)) },
    { libelle: m("facture(s) récurrente(s)"), nombre: await compter(tx, factureRecurrente, eq(factureRecurrente.contactId, contactId)) },
    { libelle: m("dossier(s)"), nombre: await compter(tx, dossier, eq(dossier.contactId, contactId)) },
    { libelle: m("ticket(s) de support"), nombre: await compter(tx, ticketSupport, eq(ticketSupport.contactId, contactId)) },
    { libelle: m("deal(s) (à supprimer d'abord)"), nombre: await compter(tx, deal, eq(deal.contactId, contactId)) },
  ];
  if (blocages.some((b) => b.nombre > 0)) return refus(blocages, m("Ce contact est encore lié à des éléments qui ne peuvent pas disparaître avec lui."));

  // Pièces et documents du client : supprimés pour de bon avec lui (droit à l'effacement), fichiers R2 compris
  // (les clés sont rendues à l'appelant, qui les efface APRÈS la validation de la transaction). Chaque suppression
  // est consignée au journal d'accès, y compris celle des pièces sensibles.
  const documentsDuContact = await tx.select({ id: document.id, cleStockage: document.cleStockage }).from(document).where(eq(document.contactId, contactId));
  const idsDocuments = documentsDuContact.map((d) => d.id);
  if (idsDocuments.length > 0) {
    await tx.insert(journalAccesDocument).values(idsDocuments.map((documentId) => ({ entrepriseId, documentId, utilisateurId: auteurId, action: "suppression" })));
    await tx
      .update(demandeSuppressionDocument)
      .set({ statut: "SANS_OBJET", traiteParId: auteurId, traiteLe: new Date() })
      .where(and(inArray(demandeSuppressionDocument.documentId, idsDocuments), eq(demandeSuppressionDocument.statut, "EN_ATTENTE")));
    await tx.delete(document).where(inArray(document.id, idsDocuments));
  }

  // Compte du portail client : le compte reste en base mais est désactivé (plus aucun accès), jamais laissé actif sans fiche.
  if (leContact.utilisateurId) {
    await tx.update(utilisateur).set({ statut: "DESACTIVE" }).where(and(eq(utilisateur.id, leContact.utilisateurId), eq(utilisateur.entrepriseId, entrepriseId), eq(utilisateur.role, "CLIENT")));
  }

  // Historique et données propres au contact : supprimés. Lien facultatif ailleurs : simplement détaché.
  await tx.delete(contactChampValeur).where(eq(contactChampValeur.contactId, contactId));
  await tx.delete(interaction).where(eq(interaction.contactId, contactId));
  await tx.delete(dealContact).where(eq(dealContact.contactId, contactId));
  await tx.delete(tacheCrm).where(eq(tacheCrm.contactId, contactId));
  await tx.delete(reunionCrm).where(eq(reunionCrm.contactId, contactId));
  await tx.update(invitation).set({ contactId: null }).where(eq(invitation.contactId, contactId));
  await tx.update(reservation).set({ contactId: null }).where(eq(reservation.contactId, contactId));
  await tx.update(messageTicketSupport).set({ auteurContactId: null }).where(eq(messageTicketSupport.auteurContactId, contactId));
  await tx.delete(contact).where(eq(contact.id, contactId));

  return { supprime: true, clesStockage: documentsDuContact.map((d) => d.cleStockage) };
}

/** Phrase lisible à partir d'un refus : « Ce contact est encore lié… : 2 facture(s), 1 dossier(s). » */
export function expliquerRefus(r: Extract<ResultatSuppression, { supprime: false }>, traduire: (t: string) => string): string {
  if (!r.blocages || r.blocages.length === 0) return traduire(r.raison);
  return `${traduire(r.raison).replace(/[.:]\s*$/, "")} : ${r.blocages.map((b) => `${b.nombre} ${traduire(b.libelle)}`).join(", ")}.`;
}
