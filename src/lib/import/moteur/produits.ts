import { eq } from "drizzle-orm";
import { produit } from "@/db/schema";
import { montant, normaliser } from "../valeurs";
import { avertir, erreur, lots, nouveauRapport, type ContexteImport, type LigneImport, type Rapport } from "./commun";

function typeProduit(brut: string | undefined): "BIEN" | "SERVICE" {
  const t = normaliser(brut ?? "");
  if (/\b(goods?|bien|biens|inventory|stock|product|produit|physical|physique|marchandise)\b/.test(t)) return "BIEN";
  return "SERVICE";
}

/** Catalogue (Zoho Books/Inventory/CRM) : un article déjà présent sous le même nom est ignoré ; prix en francs CFA entiers. */
export async function importerProduits(ctx: ContexteImport, lignes: LigneImport[]): Promise<Rapport> {
  const { tx, entrepriseId, utilisateurId } = ctx;
  const rapport = nouveauRapport();

  const existants = await tx.select({ nom: produit.nom }).from(produit).where(eq(produit.entrepriseId, entrepriseId));
  const vus = new Set(existants.map((p) => normaliser(p.nom)));

  const aCreer: (typeof produit.$inferInsert)[] = [];
  let prixAbsents = 0;

  for (const { numero, v } of lignes) {
    const nom = (v.nom ?? "").trim();
    if (nom.length < 2) {
      erreur(rapport, numero, "Nom manquant ou trop court.");
      continue;
    }
    const cle = normaliser(nom);
    if (vus.has(cle)) {
      rapport.ignores++;
      continue;
    }
    const prixVente = montant(v.prixVente);
    const prixAchat = montant(v.prixAchat);
    if ((prixVente ?? 0) < 0 || (prixAchat ?? 0) < 0) {
      erreur(rapport, numero, "Prix négatif.");
      continue;
    }
    if (prixVente === null) prixAbsents++;

    const type = typeProduit(v.type);
    const stock = montant(v.stock);
    // Un stock n'a de sens que pour un bien (voir creerProduit) : jamais de suivi de stock sur un service.
    const suiviStock = type === "BIEN" && stock !== null;
    vus.add(cle);
    aCreer.push({
      entrepriseId,
      type,
      nom,
      description: (v.description ?? "").trim() || null,
      prixVente: prixVente ?? 0,
      prixAchat: prixAchat ?? 0,
      suiviStock,
      stockActuel: suiviStock ? Math.max(0, stock ?? 0) : 0,
      creeParId: utilisateurId,
    });
  }

  for (const lot of lots(aCreer)) await tx.insert(produit).values(lot);
  rapport.crees = aCreer.length;
  if (prixAbsents > 0) avertir(rapport, 0, `${prixAbsents} article(s) sans prix de vente : prix mis à 0, à compléter.`);
  return rapport;
}
