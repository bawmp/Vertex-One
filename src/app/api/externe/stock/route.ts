import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { avecEntreprise } from "@/db/client";
import { cleApiEntreprise } from "@/db/schema";
import { authentifierCleStock, reponse } from "@/lib/api-externe/auth-stock";
import { lireStockSite } from "@/lib/api-externe/stock-site";

/**
 * GET /api/externe/stock — le site connecté lit le stock disponible de Vertex One (produits suivis qui ont un code-barres), pour afficher
 * « en stock » ou « rupture » et corriger son propre affichage. `?codes=ENF-0001,ELE-0002` limite la lecture à quelques codes.
 * Réponse : { depot, produits: [{ code, nom, disponible }], tronque }. « disponible » = en stock dans le dépôt de la connexion moins les
 * quantités réservées par des commandes client en cours, jamais négatif.
 */
export async function GET(requete: Request) {
  const auth = await authentifierCleStock(requete);
  if (!auth.ok) return auth.reponse;

  const codes = new URL(requete.url).searchParams.get("codes");
  const liste = codes ? codes.split(",").map((c) => c.trim()).filter(Boolean).slice(0, 200) : undefined;

  const stock = await avecEntreprise(auth.entrepriseId, async (tx) => {
    await tx.update(cleApiEntreprise).set({ dernierUsageLe: new Date() }).where(eq(cleApiEntreprise.id, auth.cle.id));
    return lireStockSite(tx, auth.entrepriseId, auth.cle, liste);
  });
  revalidatePath("/app/parametres/integrations");
  return reponse({ depot: stock.depot.nom, produits: stock.produits, tronque: stock.tronque }, 200);
}

// Aucun autre verbe n'est servi : Next répond 405.
