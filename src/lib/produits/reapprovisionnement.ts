import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { TransactionDrizzle } from "@/db/client";
import { bonCommandeAchat, compteComptable, entreprise, fournisseur, ligneBonCommandeAchat, produit } from "@/db/schema";
import { genererNumeroBonCommandeAchat } from "@/lib/facturation/numerotation";
import { calculerMontants } from "@/lib/facturation/calcul";
import { m } from "@/lib/i18n/catalogue";
import { aReapprovisionner, niveauStock, type NiveauStock } from "./niveau-stock";
import { quantiteSuggeree } from "./reapprovisionnement-regles";

export type LigneReappro = {
  produitId: string;
  nom: string;
  niveau: NiveauStock;
  stockActuel: number;
  seuilAlerte: number | null;
  /** Déjà commandé (bons de commande fournisseur en brouillon, pas encore facturés). */
  enCommande: number;
  quantiteSuggeree: number;
  prixAchat: number;
  fournisseurId: string | null;
};

/** Produits à recommander : stock bas ou rupture. Un produit déjà couvert par une commande en cours reste listé avec une quantité de zéro. */
export async function lireAReapprovisionner(tx: TransactionDrizzle, entrepriseId: string): Promise<{ lignes: LigneReappro[]; fournisseurs: { id: string; nom: string }[] }> {
  const [produits, commandes, fournisseurs] = await Promise.all([
    tx
      .select({ id: produit.id, nom: produit.nom, type: produit.type, suiviStock: produit.suiviStock, stockActuel: produit.stockActuel, seuilAlerte: produit.seuilAlerte, stockCible: produit.stockCible, prixAchat: produit.prixAchat, fournisseurId: produit.fournisseurHabituelId })
      .from(produit)
      .where(and(eq(produit.entrepriseId, entrepriseId), eq(produit.type, "BIEN"), eq(produit.suiviStock, true)))
      .orderBy(asc(produit.nom)),
    tx
      .select({ produitId: ligneBonCommandeAchat.produitId, quantite: sql<number>`coalesce(sum(${ligneBonCommandeAchat.quantite}), 0)::float` })
      .from(ligneBonCommandeAchat)
      .innerJoin(bonCommandeAchat, eq(ligneBonCommandeAchat.bonCommandeAchatId, bonCommandeAchat.id))
      .where(and(eq(bonCommandeAchat.entrepriseId, entrepriseId), eq(bonCommandeAchat.statut, "BROUILLON")))
      .groupBy(ligneBonCommandeAchat.produitId),
    tx.select({ id: fournisseur.id, nom: fournisseur.nom }).from(fournisseur).where(eq(fournisseur.entrepriseId, entrepriseId)).orderBy(asc(fournisseur.nom)),
  ]);
  const enCommande = new Map(commandes.filter((c) => c.produitId).map((c) => [c.produitId as string, c.quantite]));
  const lignes = produits
    .filter((p) => aReapprovisionner(p))
    .map((p) => ({
      produitId: p.id,
      nom: p.nom,
      niveau: niveauStock(p) as NiveauStock,
      stockActuel: p.stockActuel,
      seuilAlerte: p.seuilAlerte,
      enCommande: enCommande.get(p.id) ?? 0,
      quantiteSuggeree: Math.ceil(quantiteSuggeree({ ...p, enCommande: enCommande.get(p.id) ?? 0 })),
      prixAchat: p.prixAchat,
      fournisseurId: p.fournisseurId,
    }));
  return { lignes, fournisseurs };
}

export type DemandeCommande = { produitId: string; quantite: number; fournisseurId: string };
export type ResultatBons = { ok: true; bons: { numero: string; fournisseur: string; lignes: number }[] } | { ok: false; erreur: string };

/**
 * Crée un bon de commande fournisseur (brouillon) par fournisseur, à partir des lignes choisies. Rien n'est jamais pris tel quel du
 * navigateur : les produits (biens suivis) et les fournisseurs sont relus dans la transaction de l'entreprise, le prix est le prix d'achat
 * du produit, la quantité un entier positif. Un fournisseur choisi devient le fournisseur habituel d'un produit qui n'en avait pas.
 * Aucune écriture comptable ni mouvement de stock : le stock n'entre qu'à la facture du fournisseur, comme pour tout bon de commande.
 */
export async function creerBonsDeCommande(tx: TransactionDrizzle, entrepriseId: string, utilisateurId: string, demandes: DemandeCommande[]): Promise<ResultatBons> {
  if (demandes.length === 0) return { ok: false, erreur: m("Choisissez au moins un produit à commander.") };
  if (demandes.some((d) => !Number.isInteger(d.quantite) || d.quantite <= 0 || d.quantite > 1_000_000)) return { ok: false, erreur: m("Chaque quantité doit être un entier positif.") };
  if (new Set(demandes.map((d) => d.produitId)).size !== demandes.length) return { ok: false, erreur: m("Un produit ne peut figurer qu'une fois.") };

  const produits = await tx
    .select({ id: produit.id, nom: produit.nom, prixAchat: produit.prixAchat, habituel: produit.fournisseurHabituelId })
    .from(produit)
    .where(and(eq(produit.entrepriseId, entrepriseId), eq(produit.type, "BIEN"), eq(produit.suiviStock, true), inArray(produit.id, demandes.map((d) => d.produitId))));
  if (produits.length !== demandes.length) return { ok: false, erreur: m("Produit introuvable ou sans suivi de stock.") };
  const idsFournisseurs = [...new Set(demandes.map((d) => d.fournisseurId))];
  const fournisseurs = await tx.select({ id: fournisseur.id, nom: fournisseur.nom }).from(fournisseur).where(and(eq(fournisseur.entrepriseId, entrepriseId), inArray(fournisseur.id, idsFournisseurs)));
  if (fournisseurs.length !== idsFournisseurs.length) return { ok: false, erreur: m("Choisissez un fournisseur pour chaque produit.") };

  const [compte] = await tx.select({ id: compteComptable.id }).from(compteComptable).where(eq(compteComptable.numero, "601000"));
  if (!compte) return { ok: false, erreur: m("Le plan comptable ne contient pas le compte 601000 : contactez le support.") };
  const [monEntreprise] = await tx.select({ assujetti: entreprise.assujettiTVA }).from(entreprise).where(eq(entreprise.id, entrepriseId));
  const tauxTVA = monEntreprise?.assujetti === false ? 0 : 19.25;

  const bons: { numero: string; fournisseur: string; lignes: number }[] = [];
  for (const f of fournisseurs) {
    const siennes = demandes.filter((d) => d.fournisseurId === f.id);
    const lignes = siennes.map((d) => {
      const p = produits.find((x) => x.id === d.produitId)!;
      return { produitId: p.id, designation: p.nom, quantite: d.quantite, prixUnitaire: p.prixAchat, tauxTVA };
    });
    const montants = calculerMontants(lignes);
    const numero = await genererNumeroBonCommandeAchat(tx, entrepriseId);
    const [bon] = await tx
      .insert(bonCommandeAchat)
      .values({ entrepriseId, numero, fournisseurId: f.id, compteComptableId: compte.id, montantHT: montants.montantHT, montantTVA: montants.montantTVA, montantTTC: montants.montantTTC, assigneAId: utilisateurId, creeParId: utilisateurId })
      .returning({ id: bonCommandeAchat.id });
    await tx.insert(ligneBonCommandeAchat).values(lignes.map((l) => ({ entrepriseId, bonCommandeAchatId: bon.id, ...l })));
    for (const d of siennes) {
      const p = produits.find((x) => x.id === d.produitId)!;
      if (!p.habituel) await tx.update(produit).set({ fournisseurHabituelId: f.id }).where(eq(produit.id, p.id));
    }
    bons.push({ numero, fournisseur: f.nom, lignes: lignes.length });
  }
  return { ok: true, bons };
}

/** Fixe le fournisseur habituel et le stock cible d'un bien suivi (champs vides = aucun). */
export async function definirReapprovisionnement(tx: TransactionDrizzle, entrepriseId: string, produitId: string, fournisseurId: string | null, stockCible: number | null): Promise<{ ok: true } | { ok: false; erreur: string }> {
  if (stockCible !== null && (!Number.isInteger(stockCible) || stockCible < 0 || stockCible > 1_000_000)) return { ok: false, erreur: m("Le stock visé doit être un nombre entier, zéro ou plus.") };
  if (fournisseurId) {
    const [f] = await tx.select({ id: fournisseur.id }).from(fournisseur).where(and(eq(fournisseur.id, fournisseurId), eq(fournisseur.entrepriseId, entrepriseId)));
    if (!f) return { ok: false, erreur: m("Fournisseur introuvable.") };
  }
  const modifies = await tx
    .update(produit)
    .set({ fournisseurHabituelId: fournisseurId, stockCible })
    .where(and(eq(produit.id, produitId), eq(produit.entrepriseId, entrepriseId), eq(produit.type, "BIEN"), eq(produit.suiviStock, true)))
    .returning({ id: produit.id });
  if (modifies.length === 0) return { ok: false, erreur: m("Le suivi du stock n'est pas activé pour ce produit.") };
  return { ok: true };
}
