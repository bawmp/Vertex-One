import { inArray } from "drizzle-orm";
import type { TransactionDrizzle } from "@/db/client";
import { compteComptable, ecritureComptable } from "@/db/schema";

// compteId : quand le compte est déjà connu (ex. catégorie de charge choisie
// par l'utilisateur pour une Dépense) — évite une résolution par numéro pour
// un compte qui n'est pas fixe dans le code appelant, contrairement à
// numeroCompte (comptes SYSCOHADA fixes comme 411000/706000).
type LigneEcriture = { numeroCompte?: string; compteId?: string; libelle: string; debit?: number; credit?: number };

/**
 * Résout les numéros de compte en ids une seule fois par lot, puis insère
 * toutes les lignes de l'écriture — jamais une ligne "orpheline" sans
 * contrepartie, toujours l'écriture complète ou rien (même transaction que
 * l'appelant, docs/palier-4-*, section 4).
 */
async function creerEcritures(
  tx: TransactionDrizzle,
  entrepriseId: string,
  dateEcriture: Date,
  lignes: LigneEcriture[],
  reference: { factureId?: string; paiementId?: string; depenseId?: string; factureFournisseurId?: string; paiementEffectueId?: string }
): Promise<void> {
  const numeros = [...new Set(lignes.map((l) => l.numeroCompte).filter((n): n is string => !!n))];
  const comptes =
    numeros.length > 0
      ? await tx.select({ id: compteComptable.id, numero: compteComptable.numero }).from(compteComptable).where(inArray(compteComptable.numero, numeros))
      : [];
  const idParNumero = Object.fromEntries(comptes.map((c) => [c.numero, c.id]));

  const manquants = numeros.filter((n) => !idParNumero[n]);
  if (manquants.length > 0) {
    throw new Error(`Compte(s) comptable(s) introuvable(s) dans le référentiel SYSCOHADA : ${manquants.join(", ")}`);
  }

  await tx.insert(ecritureComptable).values(
    lignes.map((l) => ({
      entrepriseId,
      dateEcriture,
      libelle: l.libelle,
      compteId: l.compteId ?? idParNumero[l.numeroCompte!],
      debit: l.debit ?? 0,
      credit: l.credit ?? 0,
      factureId: reference.factureId,
      paiementId: reference.paiementId,
      depenseId: reference.depenseId,
      factureFournisseurId: reference.factureFournisseurId,
      paiementEffectueId: reference.paiementEffectueId,
    }))
  );
}

/**
 * Docs/palier-4-*, section 4 — appelée au moment exact où une Facture est
 * créée (toujours à l'état EMISE, Palier 1) : Clients au débit, Prestations
 * de services et TVA facturée au crédit. Silencieuse si l'entreprise n'est
 * pas assujettie à la TVA (montantTVA vaut alors 0, la ligne 443200
 * resterait à zéro — on l'omet plutôt que d'insérer une ligne nulle).
 */
export async function genererEcrituresFactureEmise(
  tx: TransactionDrizzle,
  facture: { id: string; entrepriseId: string; numero: string; dateEmission: Date; montantHT: number; montantTVA: number; montantTTC: number }
): Promise<void> {
  const lignes: LigneEcriture[] = [
    { numeroCompte: "411000", libelle: `Facture ${facture.numero}`, debit: facture.montantTTC },
    { numeroCompte: "706000", libelle: `Facture ${facture.numero}`, credit: facture.montantHT },
  ];
  if (facture.montantTVA > 0) {
    lignes.push({ numeroCompte: "443200", libelle: `TVA ${facture.numero}`, credit: facture.montantTVA });
  }

  await creerEcritures(tx, facture.entrepriseId, facture.dateEmission, lignes, { factureId: facture.id });
}

/**
 * Docs/palier-4-*, section 4 — appelée à chaque Paiement enregistré (qu'il
 * soit pointé manuellement ou confirmé par un futur webhook Mobile Money) :
 * le compte de trésorerie dépend du moyen de paiement, jamais codé en dur
 * pour "manuel" uniquement.
 */
export async function genererEcrituresPaiement(
  tx: TransactionDrizzle,
  params: {
    entrepriseId: string;
    factureId: string;
    paiementId: string;
    numeroFacture: string;
    montant: number;
    moyenPaiement: string;
    datePaiement: Date;
  }
): Promise<void> {
  const compteTresorerie = params.moyenPaiement === "manuel" ? "571000" : "512000"; // Caisse vs Banque/Mobile Money

  await creerEcritures(
    tx,
    params.entrepriseId,
    params.datePaiement,
    [
      { numeroCompte: compteTresorerie, libelle: `Règlement ${params.numeroFacture}`, debit: params.montant },
      { numeroCompte: "411000", libelle: `Règlement ${params.numeroFacture}`, credit: params.montant },
    ],
    { factureId: params.factureId, paiementId: params.paiementId }
  );
}

/**
 * Cycle Achats (échange du 2026-09-06) — appelée à chaque Dépense
 * enregistrée : la catégorie de charge choisie par l'utilisateur et la TVA
 * récupérable (si applicable) au débit, la trésorerie au crédit. Même
 * logique de compte de trésorerie selon le moyen de paiement que
 * genererEcrituresPaiement(), avec "especes" traité comme la Caisse plutôt
 * que la Banque (paiement plus courant en espèces côté achats que côté
 * encaissement client dans ce produit).
 */
export async function genererEcrituresDepense(
  tx: TransactionDrizzle,
  depense: {
    id: string;
    entrepriseId: string;
    libelle: string;
    compteComptableId: string;
    montantHT: number;
    montantTVA: number;
    montantTTC: number;
    moyenPaiement: string;
    datePaiement: Date;
  }
): Promise<void> {
  const compteTresorerie = depense.moyenPaiement === "especes" || depense.moyenPaiement === "manuel" ? "571000" : "512000";

  const lignes: LigneEcriture[] = [{ compteId: depense.compteComptableId, libelle: depense.libelle, debit: depense.montantHT }];
  if (depense.montantTVA > 0) {
    lignes.push({ numeroCompte: "445200", libelle: `TVA récupérable — ${depense.libelle}`, debit: depense.montantTVA });
  }
  lignes.push({ numeroCompte: compteTresorerie, libelle: depense.libelle, credit: depense.montantTTC });

  await creerEcritures(tx, depense.entrepriseId, depense.datePaiement, lignes, { depenseId: depense.id });
}

/**
 * Cycle Achats, deuxième tranche (échange du 2026-09-07) — appelée à la
 * création d'une Facture fournisseur (Bill) : catégorie de charge et TVA
 * récupérable au débit, Fournisseurs (401000) au crédit — miroir exact de
 * genererEcrituresFactureEmise() (411000 Clients ↔ 401000 Fournisseurs).
 */
export async function genererEcrituresFactureFournisseur(
  tx: TransactionDrizzle,
  factureFournisseur: {
    id: string;
    entrepriseId: string;
    numero: string;
    compteComptableId: string;
    dateFacture: Date;
    montantHT: number;
    montantTVA: number;
    montantTTC: number;
  }
): Promise<void> {
  const lignes: LigneEcriture[] = [
    { compteId: factureFournisseur.compteComptableId, libelle: `Facture fournisseur ${factureFournisseur.numero}`, debit: factureFournisseur.montantHT },
  ];
  if (factureFournisseur.montantTVA > 0) {
    lignes.push({ numeroCompte: "445200", libelle: `TVA récupérable — ${factureFournisseur.numero}`, debit: factureFournisseur.montantTVA });
  }
  lignes.push({ numeroCompte: "401000", libelle: `Facture fournisseur ${factureFournisseur.numero}`, credit: factureFournisseur.montantTTC });

  await creerEcritures(tx, factureFournisseur.entrepriseId, factureFournisseur.dateFacture, lignes, { factureFournisseurId: factureFournisseur.id });
}

/**
 * Cycle Achats, deuxième tranche — appelée à chaque Paiement effectué
 * (règlement d'une Facture fournisseur) : Fournisseurs (401000) au débit, la
 * trésorerie au crédit — miroir exact de genererEcrituresPaiement().
 */
export async function genererEcrituresPaiementEffectue(
  tx: TransactionDrizzle,
  params: {
    entrepriseId: string;
    factureFournisseurId: string;
    paiementEffectueId: string;
    numeroFactureFournisseur: string;
    montant: number;
    moyenPaiement: string;
    datePaiement: Date;
  }
): Promise<void> {
  const compteTresorerie = params.moyenPaiement === "especes" || params.moyenPaiement === "manuel" ? "571000" : "512000";

  await creerEcritures(
    tx,
    params.entrepriseId,
    params.datePaiement,
    [
      { numeroCompte: "401000", libelle: `Règlement ${params.numeroFactureFournisseur}`, debit: params.montant },
      { numeroCompte: compteTresorerie, libelle: `Règlement ${params.numeroFactureFournisseur}`, credit: params.montant },
    ],
    { factureFournisseurId: params.factureFournisseurId, paiementEffectueId: params.paiementEffectueId }
  );
}
