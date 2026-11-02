import { and, eq } from "drizzle-orm";
import type { TransactionDrizzle } from "@/db/client";
import { produit } from "@/db/schema";
import { m } from "@/lib/i18n/catalogue";
import { genererEan13Interne, normaliserCode } from "./codes-barres-regles";

export type ResultatCode = { ok: true; code: string | null } | { ok: false; erreur: string };

const estDoublon = (e: unknown) => {
  const brut = e as { code?: string; cause?: { code?: string } };
  return (brut?.code ?? brut?.cause?.code) === "23505";
};

/** Fixe (ou retire, avec `null`) le code-barres d'un bien. Un code est unique dans l'entreprise : le doublon est refusé avec le nom du produit qui le porte. */
export async function definirCodeBarres(tx: TransactionDrizzle, entrepriseId: string, produitId: string, saisie: string | null): Promise<ResultatCode> {
  const code = saisie === null || saisie.trim() === "" ? null : normaliserCode(saisie);
  if (saisie !== null && saisie.trim() !== "" && code === null) return { ok: false, erreur: m("Code invalide : 3 à 48 caractères, lettres, chiffres et - . _ / seulement.") };

  if (code) {
    const [autre] = await tx.select({ id: produit.id, nom: produit.nom }).from(produit).where(and(eq(produit.entrepriseId, entrepriseId), eq(produit.codeBarres, code)));
    if (autre && autre.id !== produitId) return { ok: false, erreur: m("Ce code est déjà utilisé par un autre produit.") };
  }
  try {
    const modifies = await tx
      .update(produit)
      .set({ codeBarres: code })
      .where(and(eq(produit.id, produitId), eq(produit.entrepriseId, entrepriseId), eq(produit.type, "BIEN")))
      .returning({ id: produit.id });
    if (modifies.length === 0) return { ok: false, erreur: m("Produit introuvable.") };
  } catch (e) {
    if (estDoublon(e)) return { ok: false, erreur: m("Ce code est déjà utilisé par un autre produit.") };
    throw e;
  }
  return { ok: true, code };
}

/** Attribue un EAN-13 interne tout neuf (plage 200-299) à un produit, en évitant les codes déjà pris. */
export async function genererCodeBarres(tx: TransactionDrizzle, entrepriseId: string, produitId: string, tirage?: () => number): Promise<ResultatCode> {
  for (let essai = 0; essai < 8; essai++) {
    const code = genererEan13Interne(tirage);
    const [pris] = await tx.select({ id: produit.id }).from(produit).where(and(eq(produit.entrepriseId, entrepriseId), eq(produit.codeBarres, code)));
    if (pris) continue;
    return definirCodeBarres(tx, entrepriseId, produitId, code);
  }
  return { ok: false, erreur: m("Impossible de générer un code libre : réessayez.") };
}

export type ProduitTrouve = { id: string; nom: string; type: "BIEN" | "SERVICE"; suiviStock: boolean; stockActuel: number; prixVente: number; unite: string | null; codeBarres: string };

/** Retrouve un produit par le code lu (exact, espaces ignorés) dans l'entreprise courante uniquement. */
export async function trouverParCode(tx: TransactionDrizzle, entrepriseId: string, lu: string): Promise<ProduitTrouve | null> {
  const code = normaliserCode(lu);
  if (!code) return null;
  const [p] = await tx
    .select({ id: produit.id, nom: produit.nom, type: produit.type, suiviStock: produit.suiviStock, stockActuel: produit.stockActuel, prixVente: produit.prixVente, unite: produit.unite })
    .from(produit)
    .where(and(eq(produit.entrepriseId, entrepriseId), eq(produit.codeBarres, code)));
  return p ? { ...p, codeBarres: code } : null;
}
