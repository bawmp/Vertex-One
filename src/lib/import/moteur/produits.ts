import { eq } from "drizzle-orm";
import { produit, mouvementStock } from "@/db/schema";
import { assurerDepotPrincipal, deplacerStockDepot } from "@/lib/produits/depots";
import { montant, normaliser } from "../valeurs";
import { m } from "@/lib/i18n/catalogue";
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

  const existants = await tx.select({ nom: produit.nom, codeBarres: produit.codeBarres }).from(produit).where(eq(produit.entrepriseId, entrepriseId));
  const vus = new Set(existants.map((p) => normaliser(p.nom)));
  // Un code-barres est unique dans l'entreprise (index partiel) : on retient ceux déjà pris, casse comprise, pour ne jamais faire échouer tout l'import.
  const codesPris = new Set(existants.filter((p) => p.codeBarres).map((p) => p.codeBarres!.trim().toLowerCase()));

  const aCreer: (typeof produit.$inferInsert)[] = [];
  let prixAbsents = 0;
  let codesEcartes = 0;

  for (const { numero, v } of lignes) {
    const nom = (v.nom ?? "").trim();
    if (nom.length < 2) {
      erreur(rapport, numero, m("Nom manquant ou trop court."));
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
      erreur(rapport, numero, m("Prix négatif."));
      continue;
    }
    if (prixVente === null) prixAbsents++;

    const type = typeProduit(v.type);
    const stock = montant(v.stock);
    // Un stock n'a de sens que pour un bien (voir creerProduit) : jamais de suivi de stock sur un service.
    const suiviStock = type === "BIEN" && stock !== null;
    vus.add(cle);
    let codeBarres: string | null = (v.codeBarres ?? "").trim().slice(0, 100) || null;
    if (codeBarres) {
      const cleCode = codeBarres.toLowerCase();
      if (codesPris.has(cleCode)) {
        codesEcartes++;
        codeBarres = null;
      } else {
        codesPris.add(cleCode);
      }
    }
    aCreer.push({
      entrepriseId,
      type,
      nom,
      codeBarres,
      description: (v.description ?? "").trim() || null,
      prixVente: prixVente ?? 0,
      prixAchat: prixAchat ?? 0,
      suiviStock,
      stockActuel: suiviStock ? Math.max(0, stock ?? 0) : 0,
      coutMoyen: suiviStock ? (prixAchat ?? 0) : 0,
      creeParId: utilisateurId,
    });
  }

  for (const lot of lots(aCreer)) {
    const crees = await tx.insert(produit).values(lot).returning({ id: produit.id, stockActuel: produit.stockActuel, suiviStock: produit.suiviStock });
    // Le stock importé est le stock de départ : il apparaît dans l'historique du produit comme tel.
    const departs = crees.filter((c) => c.suiviStock && c.stockActuel > 0).map((c) => ({ entrepriseId, produitId: c.id, type: "INITIAL" as const, quantite: c.stockActuel, stockApres: c.stockActuel, creeParId: utilisateurId }));
    if (departs.length > 0) {
      const principal = await assurerDepotPrincipal(tx, entrepriseId);
      await tx.insert(mouvementStock).values(departs.map((d) => ({ ...d, depotId: principal.id })));
      for (const d of departs) await deplacerStockDepot(tx, entrepriseId, d.produitId, principal.id, d.quantite);
    }
  }
  rapport.crees = aCreer.length;
  if (prixAbsents > 0) avertir(rapport, 0, m("{n} article(s) sans prix de vente : prix mis à 0, à compléter."), { n: prixAbsents });
  if (codesEcartes > 0) avertir(rapport, 0, m("{n} article(s) importé(s) sans code-barres : ce code était déjà utilisé par un autre produit."), { n: codesEcartes });
  return rapport;
}
