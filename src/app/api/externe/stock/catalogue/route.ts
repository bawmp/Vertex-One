import { eq } from "drizzle-orm";
import { avecEntreprise } from "@/db/client";
import { cleApiEntreprise } from "@/db/schema";
import { authentifierCleStock, reponse } from "@/lib/api-externe/auth-stock";
import { lireCatalogueSite } from "@/lib/api-externe/stock-site";

/**
 * GET /api/externe/stock/catalogue — le site connecté lit le catalogue de Vertex One (produits qui ont un code-barres) : nom, description, prix de
 * vente et d'achat, état actif et date de dernière modification (`modifieLe`, à renvoyer comme `vuLe` pour toute modification, voir
 * PATCH /api/externe/stock/produits). Même droit « stock » que les autres appels ; l'entreprise vient de la clé.
 * Réponse : { produits: [{ code, nom, description, prixVente, prixAchat, actif, modifieLe }], tronque }.
 */
export async function GET(requete: Request) {
  const auth = await authentifierCleStock(requete);
  if (!auth.ok) return auth.reponse;
  const catalogue = await avecEntreprise(auth.entrepriseId, async (tx) => {
    await tx.update(cleApiEntreprise).set({ dernierUsageLe: new Date() }).where(eq(cleApiEntreprise.id, auth.cle.id));
    return lireCatalogueSite(tx, auth.entrepriseId);
  });
  return reponse(catalogue, 200);
}

// Aucun autre verbe n'est servi : Next répond 405.
