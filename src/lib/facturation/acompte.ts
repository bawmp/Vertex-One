import { and, asc, eq, gt, inArray } from "drizzle-orm";
import type { TransactionDrizzle } from "@/db/client";
import { facture, factureAcompte, paiement } from "@/db/schema";
import { genererEcrituresApplicationAcompte } from "@/lib/comptabilite/ecritures";
import { memeClientVente } from "./client-document";
import { lireSolde, statutApresReglement } from "./solde";

/**
 * Déduction automatique des acomptes encaissés (2026-10-26). Un acompte payé est une avance du client (compte 419100) ; dès qu'une facture
 * du même client est ouverte, il vient en déduction de son solde : un RÈGLEMENT est enregistré sur la facture (moyen « manuel », référence
 * `acompte:<numéro>`) — le solde, le statut (partiellement payée / payée), le PDF et la page du client le reflètent donc sans cas particulier.
 * Aucun mouvement de trésorerie : l'écriture comptable solde l'avance (419100) contre la créance client (411000).
 *
 * Application partielle : on déduit min(reste de l'acompte, solde de la facture) ; l'acompte garde son reste pour la facture suivante.
 */
export const PREFIXE_REFERENCE_ACOMPTE = "acompte:";
const STATUTS_OUVERTS = ["EMISE", "PARTIELLEMENT_PAYEE", "EN_RETARD"] as const;

export function referenceAcompte(numero: string): string {
  return `${PREFIXE_REFERENCE_ACOMPTE}${numero}`;
}

/** Numéro d'acompte d'un règlement (`acompte:AC-…`), ou null si ce n'est pas une déduction d'acompte. */
export function numeroAcompteDeReference(reference: string | null): string | null {
  return reference?.startsWith(PREFIXE_REFERENCE_ACOMPTE) ? reference.slice(PREFIXE_REFERENCE_ACOMPTE.length) : null;
}

type Acompte = typeof factureAcompte.$inferSelect;
type Facture = typeof facture.$inferSelect;

/** Un acompte ne s'applique qu'à une facture du même client ; s'ils portent chacun une affaire (deal), ce doit être la même. */
export function acompteConcerneFacture(a: Pick<Acompte, "contactId" | "compteId" | "dealId">, f: Pick<Facture, "contactId" | "compteId" | "dealId">): boolean {
  if (!memeClientVente(a, f)) return false;
  if (a.dealId && f.dealId && a.dealId !== f.dealId) return false;
  return true;
}

/** Déduit `montant` de l'acompte sur la facture ; renvoie le montant réellement déduit (0 si l'acompte ou la facture a changé entre-temps). */
async function deduire(tx: TransactionDrizzle, a: Acompte, f: Facture, montantMax: number, dejaPaye: number): Promise<number> {
  const montant = Math.min(a.montantRestant, montantMax);
  if (montant <= 0) return 0;
  const restantApres = a.montantRestant - montant;

  // Garde contre deux déductions simultanées du même acompte : la mise à jour ne passe que si le reste n'a pas bougé.
  const [mis] = await tx
    .update(factureAcompte)
    .set({ montantRestant: restantApres, statut: restantApres === 0 ? "APPLIQUEE" : "PAYEE" })
    .where(and(eq(factureAcompte.id, a.id), eq(factureAcompte.statut, "PAYEE"), eq(factureAcompte.montantRestant, a.montantRestant)))
    .returning({ id: factureAcompte.id });
  if (!mis) return 0;

  const maintenant = new Date();
  await tx.insert(paiement).values({ entrepriseId: f.entrepriseId, factureId: f.id, montant, moyenPaiement: "manuel", referenceTransaction: referenceAcompte(a.numero), datePaiement: maintenant });
  await tx.update(facture).set({ statut: statutApresReglement(f.statut, f.montantTTC, dejaPaye + montant) }).where(eq(facture.id, f.id));
  await genererEcrituresApplicationAcompte(tx, { entrepriseId: f.entrepriseId, factureAcompteId: a.id, factureId: f.id, numeroFactureAcompte: a.numero, numeroFacture: f.numero, montant, dateApplication: maintenant });
  return montant;
}

/**
 * À appeler dès qu'une facture vient d'être émise : déduit, dans l'ordre d'encaissement, les acomptes payés du même client. Renvoie le
 * total déduit. Sans effet si la facture n'est plus ouverte ou s'il n'y a aucun acompte disponible.
 */
export async function appliquerAcomptesSurFacture(tx: TransactionDrizzle, entrepriseId: string, factureId: string): Promise<number> {
  const [f] = await tx.select().from(facture).where(and(eq(facture.id, factureId), eq(facture.entrepriseId, entrepriseId), inArray(facture.statut, [...STATUTS_OUVERTS])));
  if (!f) return 0;
  const { paye } = await lireSolde(tx, f.id, f.montantTTC);
  let dejaPaye = paye;
  let total = 0;

  const acomptes = await tx
    .select()
    .from(factureAcompte)
    .where(and(eq(factureAcompte.entrepriseId, entrepriseId), eq(factureAcompte.statut, "PAYEE"), gt(factureAcompte.montantRestant, 0)))
    .orderBy(asc(factureAcompte.dateEncaissement), asc(factureAcompte.numero));
  for (const a of acomptes) {
    if (!acompteConcerneFacture(a, f)) continue;
    const reste = f.montantTTC - dejaPaye;
    if (reste <= 0) break;
    const deduit = await deduire(tx, a, f, reste, dejaPaye);
    dejaPaye += deduit;
    total += deduit;
  }
  return total;
}

/**
 * À appeler dès qu'un acompte vient d'être encaissé : le déduit des factures ouvertes du même client, la plus ancienne d'abord. Renvoie
 * le total déduit (le reste éventuel attend la prochaine facture). Les factures déjà payées ne sont jamais touchées.
 */
export async function appliquerAcompteSurFacturesOuvertes(tx: TransactionDrizzle, entrepriseId: string, factureAcompteId: string): Promise<number> {
  let [a] = await tx.select().from(factureAcompte).where(and(eq(factureAcompte.id, factureAcompteId), eq(factureAcompte.entrepriseId, entrepriseId), eq(factureAcompte.statut, "PAYEE")));
  if (!a) return 0;
  const ouvertes = await tx
    .select()
    .from(facture)
    .where(and(eq(facture.entrepriseId, entrepriseId), inArray(facture.statut, [...STATUTS_OUVERTS])))
    .orderBy(asc(facture.dateEmission), asc(facture.numero));

  let total = 0;
  for (const f of ouvertes) {
    if (a.montantRestant <= 0) break;
    if (!acompteConcerneFacture(a, f)) continue;
    const { paye } = await lireSolde(tx, f.id, f.montantTTC);
    const reste = f.montantTTC - paye;
    if (reste <= 0) continue;
    const deduit = await deduire(tx, a, f, reste, paye);
    if (deduit > 0) {
      total += deduit;
      a = { ...a, montantRestant: a.montantRestant - deduit };
    }
  }
  return total;
}

/** Déduction demandée à la main pour UN acompte et UNE facture (le client a déjà été vérifié par l'appelant). Renvoie le montant déduit. */
export async function deduireAcompteManuellement(tx: TransactionDrizzle, entrepriseId: string, factureAcompteId: string, factureId: string): Promise<number> {
  const [a] = await tx.select().from(factureAcompte).where(and(eq(factureAcompte.id, factureAcompteId), eq(factureAcompte.entrepriseId, entrepriseId), eq(factureAcompte.statut, "PAYEE")));
  const [f] = await tx.select().from(facture).where(and(eq(facture.id, factureId), eq(facture.entrepriseId, entrepriseId), inArray(facture.statut, [...STATUTS_OUVERTS])));
  if (!a || !f) return 0;
  const { paye } = await lireSolde(tx, f.id, f.montantTTC);
  const reste = f.montantTTC - paye;
  return reste > 0 ? deduire(tx, a, f, reste, paye) : 0;
}

export type AcompteDeduit = { numero: string; montant: number };

/** Acomptes déduits d'une facture, d'après ses règlements (un par acompte, montants cumulés si déduit en plusieurs fois). */
export function extraireAcomptesDeduits(reglements: { montant: number; referenceTransaction: string | null }[]): AcompteDeduit[] {
  const parNumero = new Map<string, number>();
  for (const r of reglements) {
    const numero = numeroAcompteDeReference(r.referenceTransaction);
    if (numero) parNumero.set(numero, (parNumero.get(numero) ?? 0) + r.montant);
  }
  return [...parNumero.entries()].map(([numero, montant]) => ({ numero, montant }));
}
