import { and, asc, eq, gte, isNotNull, lte, sql } from "drizzle-orm";
import type { TransactionDrizzle } from "@/db/client";
import { compteComptable, contact, ecritureComptable, recuVente, facture, sectionAnalytique } from "@/db/schema";
import { m } from "@/lib/i18n/catalogue";
import { axeValide, codeValide, nettoyerLibelle, normaliserCode, resultatParSection, type Axe, type ResultatSection } from "./analytique-regles";

export type SectionLue = { id: string; axe: Axe; code: string; libelle: string; actif: boolean; nbEcritures: number };
export type Resultat<T = object> = ({ ok: true } & T) | { ok: false; erreur: string };

export async function listerSections(tx: TransactionDrizzle, entrepriseId: string): Promise<SectionLue[]> {
  const lignes = await tx
    .select({
      id: sectionAnalytique.id,
      axe: sectionAnalytique.axe,
      code: sectionAnalytique.code,
      libelle: sectionAnalytique.libelle,
      actif: sectionAnalytique.actif,
      nb: sql<number>`(select count(*)::int from ecriture_comptable where ecriture_comptable.section_analytique_id = section_analytique.id)`,
    })
    .from(sectionAnalytique)
    .where(eq(sectionAnalytique.entrepriseId, entrepriseId))
    .orderBy(asc(sectionAnalytique.axe), asc(sectionAnalytique.code));
  return lignes.map((l) => ({ id: l.id, axe: axeValide(l.axe) ? l.axe : "AUTRE", code: l.code, libelle: l.libelle, actif: l.actif, nbEcritures: l.nb }));
}

export async function creerSection(tx: TransactionDrizzle, entrepriseId: string, saisie: { axe: string; code: string; libelle: string }): Promise<Resultat<{ id: string }>> {
  const code = normaliserCode(saisie.code);
  const libelle = nettoyerLibelle(saisie.libelle);
  if (!axeValide(saisie.axe)) return { ok: false, erreur: m("Axe inconnu.") };
  if (!codeValide(code)) return { ok: false, erreur: m("Le code se compose de 2 à 20 lettres, chiffres, tirets ou soulignés.") };
  if (!libelle) return { ok: false, erreur: m("Donnez un nom à la section.") };
  const [existe] = await tx.select({ id: sectionAnalytique.id }).from(sectionAnalytique).where(and(eq(sectionAnalytique.entrepriseId, entrepriseId), eq(sectionAnalytique.code, code)));
  if (existe) return { ok: false, erreur: m("Ce code existe déjà.") };
  const [cree] = await tx.insert(sectionAnalytique).values({ entrepriseId, axe: saisie.axe, code, libelle }).returning({ id: sectionAnalytique.id });
  return { ok: true, id: cree.id };
}

export async function modifierSection(tx: TransactionDrizzle, entrepriseId: string, id: string, saisie: { libelle: string; actif: boolean }): Promise<Resultat> {
  const libelle = nettoyerLibelle(saisie.libelle);
  if (!libelle) return { ok: false, erreur: m("Donnez un nom à la section.") };
  const mis = await tx.update(sectionAnalytique).set({ libelle, actif: saisie.actif }).where(and(eq(sectionAnalytique.id, id), eq(sectionAnalytique.entrepriseId, entrepriseId))).returning({ id: sectionAnalytique.id });
  return mis.length ? { ok: true } : { ok: false, erreur: m("Section introuvable.") };
}

/** Type de document → colonne de l'écriture qui le désigne. */
export const DOCUMENTS_ANALYTIQUES = {
  FACTURE: ecritureComptable.factureId,
  DEPENSE: ecritureComptable.depenseId,
  FACTURE_FOURNISSEUR: ecritureComptable.factureFournisseurId,
  RECU_VENTE: ecritureComptable.recuVenteId,
  JOURNAL_MANUEL: ecritureComptable.journalManuelId,
} as const;
export type TypeDocumentAnalytique = keyof typeof DOCUMENTS_ANALYTIQUES;

/**
 * Rattache toutes les écritures d'un document (facture et ses règlements, dépense…) à une section, ou les en détache (`null`). Le
 * document et la section sont relus dans l'entreprise de la session. La section est une étiquette : elle ne change aucun montant et
 * reste modifiable même sur une période verrouillée.
 */
export async function affecterDocument(tx: TransactionDrizzle, entrepriseId: string, type: string, documentId: string, sectionId: string | null): Promise<Resultat<{ lignes: number }>> {
  if (!Object.hasOwn(DOCUMENTS_ANALYTIQUES, type)) return { ok: false, erreur: m("Type de document inconnu.") };
  const colonne = DOCUMENTS_ANALYTIQUES[type as TypeDocumentAnalytique];
  if (sectionId) {
    const [s] = await tx.select({ actif: sectionAnalytique.actif }).from(sectionAnalytique).where(and(eq(sectionAnalytique.id, sectionId), eq(sectionAnalytique.entrepriseId, entrepriseId)));
    if (!s) return { ok: false, erreur: m("Section introuvable.") };
    if (!s.actif) return { ok: false, erreur: m("Cette section est désactivée.") };
  }
  const mises = await tx.update(ecritureComptable).set({ sectionAnalytiqueId: sectionId }).where(and(eq(ecritureComptable.entrepriseId, entrepriseId), eq(colonne, documentId))).returning({ id: ecritureComptable.id });
  if (mises.length === 0) return { ok: false, erreur: m("Aucune écriture comptable pour ce document.") };
  return { ok: true, lignes: mises.length };
}

/** Section actuelle d'un document (lue sur ses écritures déjà passées), pour que les écritures suivantes — un règlement — la suivent. */
export async function sectionDuDocument(tx: TransactionDrizzle, entrepriseId: string, type: TypeDocumentAnalytique, documentId: string): Promise<string | null> {
  const [l] = await tx
    .select({ s: ecritureComptable.sectionAnalytiqueId })
    .from(ecritureComptable)
    .where(and(eq(ecritureComptable.entrepriseId, entrepriseId), eq(DOCUMENTS_ANALYTIQUES[type], documentId), isNotNull(ecritureComptable.sectionAnalytiqueId)))
    .limit(1);
  return l?.s ?? null;
}

export type ResultatAnalytique = { lignes: (ResultatSection & { code: string | null; libelle: string | null })[]; totalProduits: number; totalCharges: number };

/** Produits, charges et résultat par section sur une période, sections sans écriture comprises quand elles sont actives. */
export async function lireResultatAnalytique(tx: TransactionDrizzle, entrepriseId: string, periode: { du: Date; au: Date }): Promise<ResultatAnalytique> {
  const lignes = await tx
    .select({ section: ecritureComptable.sectionAnalytiqueId, classe: compteComptable.classe, debit: ecritureComptable.debit, credit: ecritureComptable.credit })
    .from(ecritureComptable)
    .innerJoin(compteComptable, eq(ecritureComptable.compteId, compteComptable.id))
    .where(and(eq(ecritureComptable.entrepriseId, entrepriseId), gte(ecritureComptable.dateEcriture, periode.du), lte(ecritureComptable.dateEcriture, periode.au)));
  const sections = await listerSections(tx, entrepriseId);
  const parId = new Map(sections.map((s) => [s.id, s]));
  const calcule = resultatParSection(lignes);
  const vus = new Set(calcule.map((r) => r.section));
  for (const s of sections) if (s.actif && !vus.has(s.id)) calcule.push({ section: s.id, produits: 0, charges: 0, resultat: 0 });
  const avecNoms = calcule.map((r) => ({ ...r, code: r.section ? (parId.get(r.section)?.code ?? null) : null, libelle: r.section ? (parId.get(r.section)?.libelle ?? null) : null }));
  return { lignes: avecNoms, totalProduits: avecNoms.reduce((s, r) => s + r.produits, 0), totalCharges: avecNoms.reduce((s, r) => s + r.charges, 0) };
}

/** Section par défaut d'un client : ses nouvelles factures et ses reçus y sont rattachés. `null` la retire (les écritures déjà passées ne bougent pas). */
export async function definirSectionContact(tx: TransactionDrizzle, entrepriseId: string, contactId: string, sectionId: string | null): Promise<Resultat> {
  if (sectionId) {
    const [s] = await tx.select({ actif: sectionAnalytique.actif }).from(sectionAnalytique).where(and(eq(sectionAnalytique.id, sectionId), eq(sectionAnalytique.entrepriseId, entrepriseId)));
    if (!s) return { ok: false, erreur: m("Section introuvable.") };
    if (!s.actif) return { ok: false, erreur: m("Cette section est désactivée.") };
  }
  const mis = await tx.update(contact).set({ sectionAnalytiqueId: sectionId }).where(and(eq(contact.id, contactId), eq(contact.entrepriseId, entrepriseId))).returning({ id: contact.id });
  return mis.length ? { ok: true } : { ok: false, erreur: m("Contact introuvable.") };
}

/** Section par défaut du client d'une facture ou d'un reçu de vente (si elle est encore active), pour les premières écritures du document. */
export async function sectionParDefautDuClient(tx: TransactionDrizzle, entrepriseId: string, type: "FACTURE" | "RECU_VENTE", documentId: string): Promise<string | null> {
  const [l] =
    type === "FACTURE"
      ? await tx.select({ s: contact.sectionAnalytiqueId, actif: sectionAnalytique.actif }).from(facture).innerJoin(contact, eq(facture.contactId, contact.id)).innerJoin(sectionAnalytique, eq(contact.sectionAnalytiqueId, sectionAnalytique.id)).where(and(eq(facture.id, documentId), eq(facture.entrepriseId, entrepriseId)))
      : await tx.select({ s: contact.sectionAnalytiqueId, actif: sectionAnalytique.actif }).from(recuVente).innerJoin(contact, eq(recuVente.contactId, contact.id)).innerJoin(sectionAnalytique, eq(contact.sectionAnalytiqueId, sectionAnalytique.id)).where(and(eq(recuVente.id, documentId), eq(recuVente.entrepriseId, entrepriseId)));
  return l?.actif ? l.s : null;
}
