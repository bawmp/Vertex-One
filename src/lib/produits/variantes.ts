import { and, asc, eq, sql } from "drizzle-orm";
import type { TransactionDrizzle } from "@/db/client";
import { conditionnementProduit, familleProduit, mouvementStock, produit } from "@/db/schema";
import { m } from "@/lib/i18n/catalogue";
import { assurerDepotPrincipal, deplacerStockDepot } from "./depots";
import { gestionStockActive } from "./gestion-stock";
import { combinerOptions, conditionnementValide, nomVariante, type OptionVariante } from "./variantes-regles";

export type ResultatVariantes = { ok: true; familleId: string; crees: number; ignores: number } | { ok: false; erreur: string };

export type NouvelleFamille = {
  nom: string;
  prixVente: number;
  prixAchat: number;
  suiviStock: boolean;
  /** Stock de départ de CHAQUE variante (0 par défaut). */
  stockInitial: number;
  options: OptionVariante[];
};

const entierPositifOuNul = (n: number, max = 1_000_000_000) => Number.isInteger(n) && n >= 0 && n <= max;

async function creerVariantes(tx: TransactionDrizzle, entrepriseId: string, utilisateurId: string, familleId: string, nomFamille: string, libelles: string[], f: Pick<NouvelleFamille, "prixVente" | "prixAchat" | "suiviStock" | "stockInitial">): Promise<number> {
  const suiviReel = f.suiviStock && (await gestionStockActive(tx, entrepriseId));
  const principal = suiviReel && f.stockInitial > 0 ? await assurerDepotPrincipal(tx, entrepriseId) : null;
  for (const libelle of libelles) {
    const [cree] = await tx
      .insert(produit)
      .values({
        entrepriseId,
        type: "BIEN",
        nom: nomVariante(nomFamille, libelle),
        prixVente: f.prixVente,
        prixAchat: f.prixAchat,
        suiviStock: suiviReel,
        stockActuel: suiviReel ? f.stockInitial : 0,
        coutMoyen: suiviReel ? f.prixAchat : 0,
        familleId,
        variante: libelle,
        creeParId: utilisateurId,
      })
      .returning({ id: produit.id });
    if (principal) {
      await deplacerStockDepot(tx, entrepriseId, cree.id, principal.id, f.stockInitial);
      await tx.insert(mouvementStock).values({ entrepriseId, produitId: cree.id, type: "INITIAL", quantite: f.stockInitial, stockApres: f.stockInitial, depotId: principal.id, creeParId: utilisateurId });
    }
  }
  return libelles.length;
}

/** Crée une famille et un produit par combinaison d'options (Taille × Couleur…). Les variantes sont toujours des biens. */
export async function creerFamille(tx: TransactionDrizzle, entrepriseId: string, utilisateurId: string, f: NouvelleFamille): Promise<ResultatVariantes> {
  const nom = f.nom.trim().replace(/\s+/g, " ");
  if (nom.length < 2 || nom.length > 80) return { ok: false, erreur: m("Le nom doit faire entre 2 et 80 caractères.") };
  if (!entierPositifOuNul(f.prixVente) || !entierPositifOuNul(f.prixAchat) || !entierPositifOuNul(f.stockInitial, 10_000_000)) return { ok: false, erreur: m("Les prix et le stock doivent être des nombres entiers, zéro ou plus.") };
  const combinaisons = combinerOptions(f.options);
  if (!combinaisons.ok) return { ok: false, erreur: combinaisons.erreur };

  const [famille] = await tx.insert(familleProduit).values({ entrepriseId, nom }).returning({ id: familleProduit.id });
  const crees = await creerVariantes(tx, entrepriseId, utilisateurId, famille.id, nom, combinaisons.libelles, f);
  return { ok: true, familleId: famille.id, crees, ignores: 0 };
}

/** Ajoute des variantes à une famille existante ; une combinaison déjà présente est ignorée (jamais de doublon). */
export async function ajouterVariantes(tx: TransactionDrizzle, entrepriseId: string, utilisateurId: string, familleId: string, options: OptionVariante[], reglages: Pick<NouvelleFamille, "prixVente" | "prixAchat" | "suiviStock" | "stockInitial">): Promise<ResultatVariantes> {
  const [famille] = await tx.select({ id: familleProduit.id, nom: familleProduit.nom }).from(familleProduit).where(and(eq(familleProduit.id, familleId), eq(familleProduit.entrepriseId, entrepriseId)));
  if (!famille) return { ok: false, erreur: m("Famille introuvable.") };
  if (!entierPositifOuNul(reglages.prixVente) || !entierPositifOuNul(reglages.prixAchat) || !entierPositifOuNul(reglages.stockInitial, 10_000_000)) return { ok: false, erreur: m("Les prix et le stock doivent être des nombres entiers, zéro ou plus.") };
  const combinaisons = combinerOptions(options);
  if (!combinaisons.ok) return { ok: false, erreur: combinaisons.erreur };

  const existantes = await tx.select({ variante: produit.variante }).from(produit).where(and(eq(produit.familleId, familleId), eq(produit.entrepriseId, entrepriseId)));
  const deja = new Set(existantes.map((e) => (e.variante ?? "").toLowerCase()));
  const nouvelles = combinaisons.libelles.filter((l) => !deja.has(l.toLowerCase()));
  if (nouvelles.length === 0) return { ok: false, erreur: m("Toutes ces variantes existent déjà.") };
  const crees = await creerVariantes(tx, entrepriseId, utilisateurId, familleId, famille.nom, nouvelles, reglages);
  return { ok: true, familleId, crees, ignores: combinaisons.libelles.length - nouvelles.length };
}

export type VueFamille = { id: string; nom: string; variantes: { id: string; nom: string; variante: string | null; prixVente: number; suiviStock: boolean; stockActuel: number }[] };

export async function lireFamille(tx: TransactionDrizzle, entrepriseId: string, familleId: string): Promise<VueFamille | null> {
  const [famille] = await tx.select({ id: familleProduit.id, nom: familleProduit.nom }).from(familleProduit).where(and(eq(familleProduit.id, familleId), eq(familleProduit.entrepriseId, entrepriseId)));
  if (!famille) return null;
  const variantes = await tx
    .select({ id: produit.id, nom: produit.nom, variante: produit.variante, prixVente: produit.prixVente, suiviStock: produit.suiviStock, stockActuel: produit.stockActuel })
    .from(produit)
    .where(and(eq(produit.familleId, familleId), eq(produit.entrepriseId, entrepriseId)))
    .orderBy(asc(produit.nom));
  return { ...famille, variantes };
}

export async function listerFamilles(tx: TransactionDrizzle, entrepriseId: string) {
  return tx
    .select({
      id: familleProduit.id,
      nom: familleProduit.nom,
      variantes: sql<number>`(select count(*)::int from produit p where p.famille_id = famille_produit.id)`,
      stock: sql<number>`(select coalesce(sum(p.stock_actuel), 0)::int from produit p where p.famille_id = famille_produit.id and p.suivi_stock)`,
    })
    .from(familleProduit)
    .where(eq(familleProduit.entrepriseId, entrepriseId))
    .orderBy(asc(familleProduit.nom));
}

export type ResultatSimple = { ok: true } | { ok: false; erreur: string };

/** Unité de base d'un produit (« pièce », « kg »…), facultative. */
export async function definirUnite(tx: TransactionDrizzle, entrepriseId: string, produitId: string, unite: string | null): Promise<ResultatSimple> {
  const propre = unite === null ? null : unite.trim().replace(/\s+/g, " ");
  if (propre !== null && (propre.length < 1 || propre.length > 20)) return { ok: false, erreur: m("L'unité doit faire entre 1 et 20 caractères.") };
  const modifies = await tx
    .update(produit)
    .set({ unite: propre || null })
    .where(and(eq(produit.id, produitId), eq(produit.entrepriseId, entrepriseId), eq(produit.type, "BIEN")))
    .returning({ id: produit.id });
  if (modifies.length === 0) return { ok: false, erreur: m("Produit introuvable.") };
  return { ok: true };
}

export async function lireConditionnements(tx: TransactionDrizzle, entrepriseId: string, produitId: string) {
  return tx
    .select({ id: conditionnementProduit.id, nom: conditionnementProduit.nom, quantiteBase: conditionnementProduit.quantiteBase })
    .from(conditionnementProduit)
    .where(and(eq(conditionnementProduit.entrepriseId, entrepriseId), eq(conditionnementProduit.produitId, produitId)))
    .orderBy(asc(conditionnementProduit.quantiteBase));
}

export async function ajouterConditionnement(tx: TransactionDrizzle, entrepriseId: string, produitId: string, nom: string, quantiteBase: number): Promise<ResultatSimple> {
  const invalide = conditionnementValide(nom, quantiteBase);
  if (invalide) return { ok: false, erreur: invalide };
  const [p] = await tx.select({ id: produit.id }).from(produit).where(and(eq(produit.id, produitId), eq(produit.entrepriseId, entrepriseId), eq(produit.type, "BIEN")));
  if (!p) return { ok: false, erreur: m("Produit introuvable.") };
  const existants = await lireConditionnements(tx, entrepriseId, produitId);
  const propre = nom.trim().replace(/\s+/g, " ");
  if (existants.some((c) => c.nom.toLowerCase() === propre.toLowerCase())) return { ok: false, erreur: m("Ce conditionnement existe déjà.") };
  if (existants.length >= 5) return { ok: false, erreur: m("Cinq conditionnements au plus par produit.") };
  await tx.insert(conditionnementProduit).values({ entrepriseId, produitId, nom: propre, quantiteBase });
  return { ok: true };
}

export async function retirerConditionnement(tx: TransactionDrizzle, entrepriseId: string, conditionnementId: string): Promise<ResultatSimple> {
  const supprimes = await tx.delete(conditionnementProduit).where(and(eq(conditionnementProduit.id, conditionnementId), eq(conditionnementProduit.entrepriseId, entrepriseId))).returning({ id: conditionnementProduit.id });
  if (supprimes.length === 0) return { ok: false, erreur: m("Conditionnement introuvable.") };
  return { ok: true };
}
