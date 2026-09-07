import { eq, lte, gte, and } from "drizzle-orm";
import type { TransactionDrizzle } from "@/db/client";
import { ecritureComptable, compteComptable } from "@/db/schema";

export type LigneBalance = { numero: string; libelle: string; classe: number; debit: number; credit: number; solde: number };

/**
 * Docs/palier-4-*, section 4 — agrège les écritures par compte, jusqu'à une
 * date d'arrêt optionnelle (Bilan/Compte de résultat "à la date de"). Le
 * solde est débit - crédit : positif pour un compte à solde débiteur normal
 * (actif, charge), négatif pour un compte à solde créditeur normal (passif,
 * produit) — l'appelant sait déjà, par la classe SYSCOHADA, quel signe
 * attendre pour chaque section.
 *
 * `dateDebut` (échange du 2026-09-07, tableau de bord FACO) borne la fenêtre
 * par le bas — utile pour isoler les mouvements d'une seule période
 * (l'exercice en cours) plutôt que le cumul depuis toujours. Optionnel,
 * n'affecte aucun appelant existant.
 */
export async function calculerBalance(tx: TransactionDrizzle, entrepriseId: string, dateArret?: Date, dateDebut?: Date): Promise<LigneBalance[]> {
  const conditions = [eq(ecritureComptable.entrepriseId, entrepriseId)];
  if (dateArret) conditions.push(lte(ecritureComptable.dateEcriture, dateArret));
  if (dateDebut) conditions.push(gte(ecritureComptable.dateEcriture, dateDebut));

  const lignes = await tx
    .select({
      numero: compteComptable.numero,
      libelle: compteComptable.libelle,
      classe: compteComptable.classe,
      debit: ecritureComptable.debit,
      credit: ecritureComptable.credit,
    })
    .from(ecritureComptable)
    .innerJoin(compteComptable, eq(ecritureComptable.compteId, compteComptable.id))
    .where(and(...conditions));

  const parCompte = new Map<string, LigneBalance>();
  for (const l of lignes) {
    const existant = parCompte.get(l.numero);
    if (existant) {
      existant.debit += l.debit;
      existant.credit += l.credit;
      existant.solde = existant.debit - existant.credit;
    } else {
      parCompte.set(l.numero, { numero: l.numero, libelle: l.libelle, classe: l.classe, debit: l.debit, credit: l.credit, solde: l.debit - l.credit });
    }
  }

  return [...parCompte.values()].sort((a, b) => a.numero.localeCompare(b.numero));
}

export type CompteDeResultat = {
  produits: LigneBalance[];
  charges: LigneBalance[];
  totalProduits: number;
  totalCharges: number;
  resultatNet: number;
};

/**
 * Classes SYSCOHADA 6 (Charges) et 7 (Produits) — regroupement simplifié par
 * classe de compte, pas la présentation officielle complète (soldes
 * intermédiaires de gestion, etc.) : un brouillon exportable au sens de
 * docs/palier-4-*, section 4, pas un état conforme prêt au dépôt DGI.
 */
export function calculerCompteDeResultat(balance: LigneBalance[]): CompteDeResultat {
  const charges = balance.filter((l) => l.classe === 6);
  const produits = balance.filter((l) => l.classe === 7);
  const totalCharges = charges.reduce((s, l) => s + l.solde, 0);
  const totalProduits = produits.reduce((s, l) => s - l.solde, 0); // solde créditeur normal, inversé pour un total positif
  return { produits, charges, totalProduits, totalCharges, resultatNet: totalProduits - totalCharges };
}

export type Bilan = {
  actif: LigneBalance[];
  passif: LigneBalance[];
  totalActif: number;
  totalPassif: number;
};

/**
 * Regroupement simplifié : classes 2/3/5 (immobilisations, stocks,
 * trésorerie) et les comptes de tiers à solde débiteur (ex. 411000 Clients)
 * côté Actif ; classe 1 (ressources durables) et les comptes de tiers à
 * solde créditeur (ex. 401000 Fournisseurs) côté Passif. Le résultat net de
 * l'exercice (classes 6/7) est intégré au Passif pour équilibrer le Bilan,
 * comme un compte de capitaux propres provisoire — approximation délibérée
 * pour un brouillon, pas une présentation SYSCOHADA certifiée.
 */
export function calculerBilan(balance: LigneBalance[]): Bilan {
  const actif: LigneBalance[] = [];
  const passif: LigneBalance[] = [];

  for (const l of balance) {
    if (l.classe === 2 || l.classe === 3 || l.classe === 5) {
      actif.push(l);
    } else if (l.classe === 1) {
      passif.push(l);
    } else if (l.classe === 4) {
      if (l.solde >= 0) actif.push(l);
      else passif.push(l);
    }
  }

  const { resultatNet } = calculerCompteDeResultat(balance);

  const totalActif = actif.reduce((s, l) => s + l.solde, 0);
  const totalPassifSaufResultat = passif.reduce((s, l) => s - l.solde, 0);
  const totalPassif = totalPassifSaufResultat + resultatNet;

  return { actif, passif, totalActif, totalPassif };
}
