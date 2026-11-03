import { and, asc, eq } from "drizzle-orm";
import type { TransactionDrizzle } from "@/db/client";
import { composantKit, produit } from "@/db/schema";
import { m } from "@/lib/i18n/catalogue";
import { MAX_COMPOSANTS, coutDuKit, kitsDisponibles, quantiteComposantValide } from "./kits-regles";

export type ResultatKit = { ok: true; id?: string } | { ok: false; erreur: string };

export type ComposantDemande = { produitId: string; quantite: number };

/** Biens suivis en stock qui peuvent entrer dans un kit (jamais un autre kit). */
export async function produitsComposables(tx: TransactionDrizzle, entrepriseId: string) {
  return tx
    .select({ id: produit.id, nom: produit.nom, stockActuel: produit.stockActuel, coutMoyen: produit.coutMoyen, unite: produit.unite })
    .from(produit)
    .where(and(eq(produit.entrepriseId, entrepriseId), eq(produit.type, "BIEN"), eq(produit.suiviStock, true), eq(produit.estKit, false)))
    .orderBy(asc(produit.nom));
}

async function composantValide(tx: TransactionDrizzle, entrepriseId: string, produitId: string): Promise<boolean> {
  const [p] = await tx
    .select({ id: produit.id })
    .from(produit)
    .where(and(eq(produit.id, produitId), eq(produit.entrepriseId, entrepriseId), eq(produit.type, "BIEN"), eq(produit.suiviStock, true), eq(produit.estKit, false)));
  return Boolean(p);
}

/**
 * Crée un kit : un produit sans stock propre, composé de biens suivis. Les composants sont relus dans l'entreprise (jamais un produit d'une
 * autre) ; ni doublon ni kit dans un kit ; de 1 à 20 composants, chacun en quantité entière de 1 à 10 000. Le prix d'achat enregistré est le
 * coût de revient du moment (information : le coût réel suit les composants).
 */
export async function creerKit(tx: TransactionDrizzle, entrepriseId: string, utilisateurId: string, k: { nom: string; prixVente: number; composants: ComposantDemande[] }): Promise<ResultatKit> {
  const nom = k.nom.trim().replace(/\s+/g, " ");
  if (nom.length < 2 || nom.length > 80) return { ok: false, erreur: m("Le nom doit faire entre 2 et 80 caractères.") };
  if (!Number.isInteger(k.prixVente) || k.prixVente < 0 || k.prixVente > 1_000_000_000) return { ok: false, erreur: m("Le prix de vente doit être un nombre entier, zéro ou plus.") };
  if (k.composants.length === 0) return { ok: false, erreur: m("Un kit contient au moins un produit.") };
  if (k.composants.length > MAX_COMPOSANTS) return { ok: false, erreur: m("Vingt produits au plus dans un kit.") };
  if (new Set(k.composants.map((c) => c.produitId)).size !== k.composants.length) return { ok: false, erreur: m("Un produit ne peut figurer qu'une fois dans un kit.") };
  if (k.composants.some((c) => !quantiteComposantValide(c.quantite))) return { ok: false, erreur: m("Chaque quantité doit être un entier de 1 à 10 000.") };

  const composables = await produitsComposables(tx, entrepriseId);
  const parId = new Map(composables.map((p) => [p.id, p]));
  if (k.composants.some((c) => !parId.has(c.produitId))) return { ok: false, erreur: m("Un produit du kit est introuvable, n'est pas suivi en stock, ou est déjà un kit.") };

  const cout = coutDuKit(k.composants.map((c) => ({ coutMoyen: parId.get(c.produitId)!.coutMoyen, quantite: c.quantite })));
  const [kit] = await tx
    .insert(produit)
    .values({ entrepriseId, type: "BIEN", nom, prixVente: k.prixVente, prixAchat: cout, suiviStock: false, stockActuel: 0, coutMoyen: 0, estKit: true, creeParId: utilisateurId })
    .returning({ id: produit.id });
  await tx.insert(composantKit).values(k.composants.map((c) => ({ entrepriseId, kitId: kit.id, composantId: c.produitId, quantite: c.quantite })));
  return { ok: true, id: kit.id };
}

export type VueKit = {
  id: string;
  nom: string;
  prixVente: number;
  composants: { produitId: string; nom: string; quantite: number; stockActuel: number; coutMoyen: number; unite: string | null }[];
  /** Combien de kits complets le stock actuel permet de vendre. */
  disponibles: number;
  /** Coût de revient d'un kit au coût moyen actuel de ses composants. */
  cout: number;
};

export async function lireKit(tx: TransactionDrizzle, entrepriseId: string, kitId: string): Promise<VueKit | null> {
  const [kit] = await tx.select({ id: produit.id, nom: produit.nom, prixVente: produit.prixVente }).from(produit).where(and(eq(produit.id, kitId), eq(produit.entrepriseId, entrepriseId), eq(produit.estKit, true)));
  if (!kit) return null;
  const lignes = await tx
    .select({ produitId: produit.id, nom: produit.nom, quantite: composantKit.quantite, stockActuel: produit.stockActuel, coutMoyen: produit.coutMoyen, unite: produit.unite })
    .from(composantKit)
    .innerJoin(produit, eq(composantKit.composantId, produit.id))
    .where(and(eq(composantKit.kitId, kitId), eq(composantKit.entrepriseId, entrepriseId)))
    .orderBy(asc(produit.nom));
  return { ...kit, composants: lignes, disponibles: kitsDisponibles(lignes), cout: coutDuKit(lignes) };
}

export async function ajouterComposant(tx: TransactionDrizzle, entrepriseId: string, kitId: string, composantId: string, quantite: number): Promise<ResultatKit> {
  if (!quantiteComposantValide(quantite)) return { ok: false, erreur: m("Chaque quantité doit être un entier de 1 à 10 000.") };
  const [kit] = await tx.select({ id: produit.id }).from(produit).where(and(eq(produit.id, kitId), eq(produit.entrepriseId, entrepriseId), eq(produit.estKit, true)));
  if (!kit) return { ok: false, erreur: m("Kit introuvable.") };
  if (!(await composantValide(tx, entrepriseId, composantId))) return { ok: false, erreur: m("Un produit du kit est introuvable, n'est pas suivi en stock, ou est déjà un kit.") };
  const existants = await tx.select({ composantId: composantKit.composantId }).from(composantKit).where(and(eq(composantKit.kitId, kitId), eq(composantKit.entrepriseId, entrepriseId)));
  if (existants.some((e) => e.composantId === composantId)) return { ok: false, erreur: m("Ce produit est déjà dans le kit : modifiez sa quantité en le retirant puis en le rajoutant.") };
  if (existants.length >= MAX_COMPOSANTS) return { ok: false, erreur: m("Vingt produits au plus dans un kit.") };
  await tx.insert(composantKit).values({ entrepriseId, kitId, composantId, quantite });
  return { ok: true };
}

export async function retirerComposant(tx: TransactionDrizzle, entrepriseId: string, kitId: string, composantId: string): Promise<ResultatKit> {
  const existants = await tx.select({ composantId: composantKit.composantId }).from(composantKit).where(and(eq(composantKit.kitId, kitId), eq(composantKit.entrepriseId, entrepriseId)));
  if (!existants.some((e) => e.composantId === composantId)) return { ok: false, erreur: m("Ce produit n'est pas dans le kit.") };
  if (existants.length <= 1) return { ok: false, erreur: m("Un kit garde au moins un produit : supprimez le kit lui-même si vous n'en voulez plus.") };
  await tx.delete(composantKit).where(and(eq(composantKit.kitId, kitId), eq(composantKit.composantId, composantId), eq(composantKit.entrepriseId, entrepriseId)));
  return { ok: true };
}

/** Vrai si ce produit entre dans la composition d'au moins un kit (il ne peut alors pas être supprimé). */
export async function estComposant(tx: TransactionDrizzle, entrepriseId: string, produitId: string): Promise<boolean> {
  const [l] = await tx.select({ id: composantKit.id }).from(composantKit).where(and(eq(composantKit.composantId, produitId), eq(composantKit.entrepriseId, entrepriseId))).limit(1);
  return Boolean(l);
}
