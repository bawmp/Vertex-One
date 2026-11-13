import type { Appeleur } from "@/lib/boutique/adresse-sure";

/* ------------------------------------------------------------ faux serveur WooCommerce ------------------------------------------------------------ */
export type OrdreWoo = { id: number; number: string; status: string; date_modified_gmt: string; line_items: { sku?: string; quantity: number; name?: string }[] };
export type ProduitWoo = { id: number; sku: string; type: string; stock: number | null };

export function fauxWooCommerce() {
  const etat = { ordres: [] as OrdreWoo[], produits: [] as ProduitWoo[], refuser: false, lots: 0, requetes: [] as string[], autorisation: "" };
  const reponse = (statut: number, corps: unknown) => ({ statut, corps: JSON.stringify(corps), entetes: new Headers() });
  const appeler: Appeleur = async (url, init) => {
    const u = new URL(url);
    etat.requetes.push(`${init?.methode ?? "GET"} ${u.pathname}${u.search}`);
    etat.autorisation = init?.entetes?.Authorization ?? "";
    if (etat.refuser) return reponse(401, { code: "woocommerce_rest_cannot_view" });
    if (!u.pathname.endsWith("/products/batch") && !u.pathname.includes("/wp-json/wc/v3/")) return reponse(404, {});
    if (u.pathname.endsWith("/orders")) {
      const apres = u.searchParams.get("modified_after") ?? "";
      const page = Number(u.searchParams.get("page") ?? 1);
      const filtres = etat.ordres.filter((o) => o.date_modified_gmt > apres);
      return reponse(200, filtres.slice((page - 1) * 100, page * 100));
    }
    if (u.pathname.endsWith("/products/batch")) {
      etat.lots++;
      const { update } = JSON.parse(init!.corps!) as { update: { id: number; manage_stock: boolean; stock_quantity: number }[] };
      return reponse(200, {
        update: update.map((m) => {
          const p = etat.produits.find((x) => x.id === m.id);
          if (!p) return { id: m.id, error: { code: "woocommerce_rest_product_invalid_id" } };
          p.stock = m.stock_quantity;
          return { id: m.id };
        }),
      });
    }
    if (u.pathname.endsWith("/products")) {
      const page = Number(u.searchParams.get("page") ?? 1);
      const par = Number(u.searchParams.get("per_page") ?? 10);
      return reponse(200, etat.produits.slice((page - 1) * par, page * par).map(({ id, sku, type }) => ({ id, sku, type })));
    }
    return reponse(404, {});
  };
  return { etat, appeler };
}

/** Date au format WooCommerce (GMT, sans « Z »), décalée de `minutes` par rapport à maintenant. */
export const date = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString().replace(/\.\d{3}Z$/, "");

