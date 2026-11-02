import { and, eq, gte, inArray, lt, lte, notInArray, sql } from "drizzle-orm";
import type { TransactionDrizzle } from "@/db/client";
import { avoirClient, compteComptable, contact, ecritureComptable, facture, factureFournisseur, fournisseur, paiement, paiementEffectue } from "@/db/schema";
import type { Periode } from "./livres";

/**
 * Comptes de tiers (2026-11-02, priorité 2.1) : le grand livre AUXILIAIRE des clients (compte 411000) et des fournisseurs (401000), le
 * lettrage de leurs écritures et la balance âgée de ce qu'ils doivent encore. Tout se lit dans les écritures et les documents de
 * l'entreprise, sous la protection par entreprise : jamais le tiers d'une autre.
 *
 * Le tiers d'une écriture est celui de son document : la facture (ou son règlement, son avoir) pour un client, la facture fournisseur
 * (ou son paiement) pour un fournisseur. **Lettrage** : toutes les écritures d'un même document forment un groupe ; quand leur somme
 * est nulle (la facture est entièrement soldée par ses règlements et avoirs), le groupe est « lettré » et reçoit une lettre (A, B, … Z,
 * AA…), la même sur toutes ses lignes. Le lettrage est calculé, jamais saisi : il suit toujours les règlements enregistrés.
 */

export type NatureTiers = "CLIENT" | "FOURNISSEUR";
export const COMPTE_DU_TIERS: Record<NatureTiers, string> = { CLIENT: "411000", FOURNISSEUR: "401000" };

export type LigneAuxiliaire = {
  id: string;
  date: Date;
  libelle: string;
  debit: number;
  credit: number;
  tiersId: string | null;
  tiersNom: string;
  /** Clé du document d'origine (la facture, la facture fournisseur) : sert au lettrage. */
  documentId: string | null;
  documentNumero: string | null;
};

/** A, B, … Z, AA, AB… (comme sur un grand livre papier). */
export function lettreDuRang(rang: number): string {
  let n = rang;
  let lettre = "";
  do {
    lettre = String.fromCharCode(65 + (n % 26)) + lettre;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return lettre;
}

/**
 * Règle pure du lettrage : renvoie, pour chaque document dont les écritures s'annulent (débit = crédit sur l'ensemble des lignes
 * fournies), sa lettre. L'ordre des lettres suit la première date de chaque groupe, donc une même lecture donne toujours les mêmes lettres.
 */
export function calculerLettrage(lignes: LigneAuxiliaire[]): Map<string, string> {
  const groupes = new Map<string, { solde: number; premiere: number }>();
  for (const l of lignes) {
    if (!l.documentId) continue;
    const g = groupes.get(l.documentId) ?? { solde: 0, premiere: l.date.getTime() };
    g.solde += l.debit - l.credit;
    g.premiere = Math.min(g.premiere, l.date.getTime());
    groupes.set(l.documentId, g);
  }
  const lettres = new Map<string, string>();
  [...groupes.entries()]
    .filter(([, g]) => g.solde === 0)
    .sort((a, b) => a[1].premiere - b[1].premiere || a[0].localeCompare(b[0]))
    .forEach(([document], rang) => lettres.set(document, lettreDuRang(rang)));
  return lettres;
}

export type LigneGrandLivreAuxiliaire = LigneAuxiliaire & { soldeCumule: number; lettre: string | null };
export type TiersGrandLivre = { tiersId: string | null; nom: string; soldeOuverture: number; lignes: LigneGrandLivreAuxiliaire[]; totalDebit: number; totalCredit: number; soldeCloture: number };

/** Règle pure : regroupe par tiers, solde reporté, solde cumulé, totaux ; le lettrage tient compte de TOUT l'historique (avant + période). */
export function construireGrandLivreAuxiliaire(avant: LigneAuxiliaire[], periode: LigneAuxiliaire[]): TiersGrandLivre[] {
  const lettres = calculerLettrage([...avant, ...periode]);
  const cle = (l: LigneAuxiliaire) => l.tiersId ?? "__sans_tiers__";
  const ouverture = new Map<string, number>();
  const noms = new Map<string, { id: string | null; nom: string }>();
  for (const l of avant) {
    ouverture.set(cle(l), (ouverture.get(cle(l)) ?? 0) + l.debit - l.credit);
    noms.set(cle(l), { id: l.tiersId, nom: l.tiersNom });
  }
  const parTiers = new Map<string, LigneAuxiliaire[]>();
  for (const l of periode) {
    noms.set(cle(l), { id: l.tiersId, nom: l.tiersNom });
    (parTiers.get(cle(l)) ?? parTiers.set(cle(l), []).get(cle(l))!).push(l);
  }
  const retenus = new Set<string>([...parTiers.keys(), ...[...ouverture.entries()].filter(([, s]) => s !== 0).map(([k]) => k)]);
  return [...retenus]
    .sort((a, b) => noms.get(a)!.nom.localeCompare(noms.get(b)!.nom))
    .map((k) => {
      const soldeOuverture = ouverture.get(k) ?? 0;
      let cumul = soldeOuverture;
      let totalDebit = 0;
      let totalCredit = 0;
      const lignes = (parTiers.get(k) ?? []).map((l) => {
        cumul += l.debit - l.credit;
        totalDebit += l.debit;
        totalCredit += l.credit;
        return { ...l, soldeCumule: cumul, lettre: l.documentId ? (lettres.get(l.documentId) ?? null) : null };
      });
      return { tiersId: noms.get(k)!.id, nom: noms.get(k)!.nom, soldeOuverture, lignes, totalDebit, totalCredit, soldeCloture: cumul };
    });
}

async function lireLignesAuxiliaires(tx: TransactionDrizzle, entrepriseId: string, nature: NatureTiers, conditions: ReturnType<typeof and>[]): Promise<LigneAuxiliaire[]> {
  const numeroCompte = COMPTE_DU_TIERS[nature];
  const conditionsCommunes = [eq(ecritureComptable.entrepriseId, entrepriseId), eq(compteComptable.numero, numeroCompte), ...conditions];

  if (nature === "CLIENT") {
    const lignes = await tx
      .select({ id: ecritureComptable.id, date: ecritureComptable.dateEcriture, libelle: ecritureComptable.libelle, debit: ecritureComptable.debit, credit: ecritureComptable.credit, factureId: ecritureComptable.factureId, numero: facture.numero, contactId: facture.contactId, nom: contact.nom })
      .from(ecritureComptable)
      .innerJoin(compteComptable, eq(ecritureComptable.compteId, compteComptable.id))
      .leftJoin(facture, eq(ecritureComptable.factureId, facture.id))
      .leftJoin(contact, eq(facture.contactId, contact.id))
      .where(and(...conditionsCommunes))
      .orderBy(ecritureComptable.dateEcriture, ecritureComptable.creeLe, ecritureComptable.id);
    return lignes.map((l) => ({ id: l.id, date: l.date, libelle: l.libelle, debit: l.debit, credit: l.credit, tiersId: l.contactId, tiersNom: l.nom ?? "Sans client rattaché", documentId: l.factureId, documentNumero: l.numero }));
  }
  const lignes = await tx
    .select({ id: ecritureComptable.id, date: ecritureComptable.dateEcriture, libelle: ecritureComptable.libelle, debit: ecritureComptable.debit, credit: ecritureComptable.credit, ffId: ecritureComptable.factureFournisseurId, numero: factureFournisseur.numero, fournisseurId: factureFournisseur.fournisseurId, nom: fournisseur.nom })
    .from(ecritureComptable)
    .innerJoin(compteComptable, eq(ecritureComptable.compteId, compteComptable.id))
    .leftJoin(factureFournisseur, eq(ecritureComptable.factureFournisseurId, factureFournisseur.id))
    .leftJoin(fournisseur, eq(factureFournisseur.fournisseurId, fournisseur.id))
    .where(and(...conditionsCommunes))
    .orderBy(ecritureComptable.dateEcriture, ecritureComptable.creeLe, ecritureComptable.id);
  return lignes.map((l) => ({ id: l.id, date: l.date, libelle: l.libelle, debit: l.debit, credit: l.credit, tiersId: l.fournisseurId, tiersNom: l.nom ?? "Sans fournisseur rattaché", documentId: l.ffId, documentNumero: l.numero }));
}

/** Grand livre auxiliaire d'une nature de tiers sur une période (un tiers précis ou tous). */
export async function lireGrandLivreAuxiliaire(tx: TransactionDrizzle, entrepriseId: string, nature: NatureTiers, { du, au }: Periode, tiersId?: string): Promise<TiersGrandLivre[]> {
  const [avant, periode] = await Promise.all([
    lireLignesAuxiliaires(tx, entrepriseId, nature, [lt(ecritureComptable.dateEcriture, du)]),
    lireLignesAuxiliaires(tx, entrepriseId, nature, [gte(ecritureComptable.dateEcriture, du), lte(ecritureComptable.dateEcriture, au)]),
  ]);
  const grandLivre = construireGrandLivreAuxiliaire(avant, periode);
  return tiersId ? grandLivre.filter((t) => t.tiersId === tiersId) : grandLivre;
}

/** Les tiers qui ont au moins une écriture (pour le sélecteur de la page). */
export async function listerTiersAvecEcritures(tx: TransactionDrizzle, entrepriseId: string, nature: NatureTiers): Promise<{ id: string; nom: string }[]> {
  const lignes = await lireLignesAuxiliaires(tx, entrepriseId, nature, []);
  const vus = new Map<string, string>();
  for (const l of lignes) if (l.tiersId) vus.set(l.tiersId, l.tiersNom);
  return [...vus.entries()].map(([id, nom]) => ({ id, nom })).sort((a, b) => a.nom.localeCompare(b.nom));
}

/* ------------------------------ Balance âgée ------------------------------ */

export const TRANCHES_AGE = ["Non échu", "1 à 30 jours", "31 à 60 jours", "61 à 90 jours", "Plus de 90 jours"] as const;
export type TrancheAge = (typeof TRANCHES_AGE)[number];

export type DocumentOuvert = { tiersId: string | null; tiersNom: string; numero: string; echeance: Date; reste: number };

/** Règle pure : en quelle tranche tombe un reste dû, d'après le nombre de jours de retard à la date `maintenant` (jours entiers). */
export function trancheDeRetard(echeance: Date, maintenant: Date): TrancheAge {
  const jours = Math.floor((maintenant.getTime() - echeance.getTime()) / 86_400_000);
  if (jours <= 0) return "Non échu";
  if (jours <= 30) return "1 à 30 jours";
  if (jours <= 60) return "31 à 60 jours";
  if (jours <= 90) return "61 à 90 jours";
  return "Plus de 90 jours";
}

export type LigneBalanceAgee = { tiersId: string | null; nom: string; tranches: Record<TrancheAge, number>; total: number; documents: { numero: string; echeance: Date; reste: number; tranche: TrancheAge }[] };
export type BalanceAgee = { lignes: LigneBalanceAgee[]; totaux: Record<TrancheAge, number>; total: number };

export function construireBalanceAgee(documents: DocumentOuvert[], maintenant: Date): BalanceAgee {
  const vide = (): Record<TrancheAge, number> => ({ "Non échu": 0, "1 à 30 jours": 0, "31 à 60 jours": 0, "61 à 90 jours": 0, "Plus de 90 jours": 0 });
  const parTiers = new Map<string, LigneBalanceAgee>();
  const totaux = vide();
  for (const d of documents) {
    if (d.reste <= 0) continue;
    const cle = d.tiersId ?? d.tiersNom;
    const ligne = parTiers.get(cle) ?? { tiersId: d.tiersId, nom: d.tiersNom, tranches: vide(), total: 0, documents: [] };
    const tranche = trancheDeRetard(d.echeance, maintenant);
    ligne.tranches[tranche] += d.reste;
    ligne.total += d.reste;
    ligne.documents.push({ numero: d.numero, echeance: d.echeance, reste: d.reste, tranche });
    totaux[tranche] += d.reste;
    parTiers.set(cle, ligne);
  }
  const lignes = [...parTiers.values()].sort((a, b) => b.total - a.total || a.nom.localeCompare(b.nom));
  for (const l of lignes) l.documents.sort((a, b) => a.echeance.getTime() - b.echeance.getTime());
  return { lignes, totaux, total: lignes.reduce((s, l) => s + l.total, 0) };
}

/** Ce que les clients (factures non soldées, nettes d'avoirs) ou l'entreprise (factures fournisseurs non soldées) doivent encore. */
export async function lireDocumentsOuverts(tx: TransactionDrizzle, entrepriseId: string, nature: NatureTiers): Promise<DocumentOuvert[]> {
  if (nature === "CLIENT") {
    const factures = await tx
      .select({ id: facture.id, numero: facture.numero, echeance: facture.dateEcheance, ttc: facture.montantTTC, contactId: facture.contactId, nom: contact.nom })
      .from(facture)
      .leftJoin(contact, eq(facture.contactId, contact.id))
      .where(and(eq(facture.entrepriseId, entrepriseId), notInArray(facture.statut, ["PAYEE", "ANNULEE"])));
    if (factures.length === 0) return [];
    const ids = factures.map((f) => f.id);
    const payes = await tx.select({ factureId: paiement.factureId, total: sql<number>`coalesce(sum(${paiement.montant}), 0)::int` }).from(paiement).where(inArray(paiement.factureId, ids)).groupBy(paiement.factureId);
    const avoirs = await tx.select({ factureId: avoirClient.factureId, total: sql<number>`coalesce(sum(${avoirClient.montantTTC}), 0)::int` }).from(avoirClient).where(inArray(avoirClient.factureId, ids)).groupBy(avoirClient.factureId);
    const paye = new Map(payes.map((p) => [p.factureId, p.total]));
    const credite = new Map(avoirs.map((a) => [a.factureId, a.total]));
    return factures.map((f) => ({ tiersId: f.contactId, tiersNom: f.nom ?? "Sans client rattaché", numero: f.numero, echeance: f.echeance, reste: Math.max(0, f.ttc - (credite.get(f.id) ?? 0) - (paye.get(f.id) ?? 0)) }));
  }
  const factures = await tx
    .select({ id: factureFournisseur.id, numero: factureFournisseur.numero, echeance: factureFournisseur.dateEcheance, ttc: factureFournisseur.montantTTC, fournisseurId: factureFournisseur.fournisseurId, nom: fournisseur.nom })
    .from(factureFournisseur)
    .leftJoin(fournisseur, eq(factureFournisseur.fournisseurId, fournisseur.id))
    .where(and(eq(factureFournisseur.entrepriseId, entrepriseId), notInArray(factureFournisseur.statut, ["PAYEE", "ANNULEE"])));
  if (factures.length === 0) return [];
  const payes = await tx.select({ factureId: paiementEffectue.factureFournisseurId, total: sql<number>`coalesce(sum(${paiementEffectue.montant}), 0)::int` }).from(paiementEffectue).where(inArray(paiementEffectue.factureFournisseurId, factures.map((f) => f.id))).groupBy(paiementEffectue.factureFournisseurId);
  const paye = new Map(payes.map((p) => [p.factureId, p.total]));
  return factures.map((f) => ({ tiersId: f.fournisseurId, tiersNom: f.nom ?? "Sans fournisseur rattaché", numero: f.numero, echeance: f.echeance, reste: Math.max(0, f.ttc - (paye.get(f.id) ?? 0)) }));
}

export async function lireBalanceAgee(tx: TransactionDrizzle, entrepriseId: string, nature: NatureTiers, maintenant: Date = new Date()): Promise<BalanceAgee> {
  return construireBalanceAgee(await lireDocumentsOuverts(tx, entrepriseId, nature), maintenant);
}
