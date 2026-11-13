import { NextResponse } from "next/server";
import { avecEntreprise } from "@/db/client";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { ecrireCsv } from "@/lib/export/csv";
import { stockAPublier } from "@/lib/boutique/synchro";

/**
 * GET /app/produits/export-stock-site — télécharge le stock disponible de Vertex One (code, nom, quantité) pour le charger dans un site
 * qu'on ne peut pas connecter automatiquement : la plupart des boutiques (Shopify, WooCommerce, PrestaShop, Wix…) acceptent un fichier
 * « SKU, Stock » à l'import des produits. Réservé à l'Administrateur (comme la connexion d'une boutique). Seuls les produits suivis qui
 * ont un code-barres sont listés, au stock disponible du dépôt principal ; jamais un prix ni un coût.
 */
export async function GET() {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) return new NextResponse("Non authentifié", { status: 401 });
  if (utilisateurConnecte.role !== "ADMIN" || !peut(utilisateurConnecte, "PARAMETRES", "VOIR")) return new NextResponse("Réservé à l'administrateur", { status: 403 });

  const lignes = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const stock = await stockAPublier(tx, utilisateurConnecte.entrepriseId, null);
    return stock.map((p) => [p.code, String(p.disponible)]);
  });

  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(ecrireCsv(["SKU", "Stock"], lignes, { separateur: ",", bom: false }), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="vertexone-stock-pour-mon-site-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
