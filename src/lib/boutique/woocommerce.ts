import { m } from "@/lib/i18n/catalogue";
import type { Appeleur } from "./adresse-sure";
import { ErreurSite } from "./adresse-sure";
import { ErreurPlateforme, type Adaptateur, type CommandeExterne, type ResultatTest } from "./types";

/**
 * Adaptateur WooCommerce (API REST v3, 2026-11-12). Authentification : clé et secret de l'utilisateur WooCommerce en « Basic » sur HTTPS
 * (`Réglages → Avancé → API REST` côté site, droits « Lecture/Écriture »). Seul le contrat des fonctions est vérifié par les tests
 * (serveur WooCommerce simulé d'après la documentation officielle) : à confirmer sur une vraie boutique avant de le promettre à un client.
 *
 * Statuts WooCommerce → action : `processing`, `completed`, `on-hold` sortent le stock ; `cancelled`, `refunded`, `failed` le remettent
 * (si la commande avait été reçue) ; `pending` (pas encore payée), `draft`, `trash` sont ignorés.
 */
const SORTENT = new Set(["processing", "completed", "on-hold"]);
const RETOURNENT = new Set(["cancelled", "refunded", "failed"]);
const MAX_PAGES_COMMANDES = 10;
const MAX_PAGES_PRODUITS = 50;
const TAILLE_LOT = 50;
/** Chevauchement de sécurité sur la date de modification : une commande modifiée pendant une lecture n'est jamais manquée. */
const CHEVAUCHEMENT_MS = 2 * 60 * 1000;

type LigneWoo = { sku?: string; quantity?: number; name?: string };
type CommandeWoo = { id: number; number?: string; status?: string; date_modified_gmt?: string; line_items?: LigneWoo[] };
type ProduitWoo = { id: number; sku?: string; type?: string };

export function creerAdaptateurWooCommerce(config: { base: string; cle: string; secret: string }, appeler: Appeleur): Adaptateur {
  const api = `${config.base}/wp-json/wc/v3`;
  const entetes = { Authorization: `Basic ${Buffer.from(`${config.cle}:${config.secret}`).toString("base64")}`, Accept: "application/json", "Content-Type": "application/json" };

  async function lire<T>(chemin: string): Promise<T> {
    const r = await appeler(`${api}${chemin}`, { entetes });
    if (r.statut === 401 || r.statut === 403) throw new ErreurPlateforme(m("WooCommerce a refusé vos clés. Vérifiez qu'elles sont complètes et qu'elles ont les droits « Lecture/Écriture »."));
    if (r.statut === 404) throw new ErreurPlateforme(m("WooCommerce est introuvable à cette adresse. Vérifiez l'adresse, et que WooCommerce est bien installé et activé."));
    if (r.statut >= 500) throw new ErreurPlateforme(m("Votre site a rencontré une erreur. Réessayez dans quelques minutes."));
    if (r.statut !== 200) throw new ErreurPlateforme(m("WooCommerce a répondu de façon inattendue."));
    try {
      return JSON.parse(r.corps) as T;
    } catch {
      throw new ErreurPlateforme(m("Cette adresse ne répond pas comme une boutique WooCommerce."));
    }
  }

  return {
    async tester(): Promise<ResultatTest> {
      try {
        await lire<ProduitWoo[]>("/products?per_page=1&_fields=id");
        return { ok: true };
      } catch (e) {
        if (e instanceof ErreurPlateforme || e instanceof ErreurSite) return { ok: false, erreur: e.message };
        throw e;
      }
    },

    async commandesDepuis(curseur) {
      const depuis = new Date(new Date(curseur).getTime() - CHEVAUCHEMENT_MS).toISOString().replace(/\.\d{3}Z$/, "");
      const brutes: CommandeWoo[] = [];
      for (let page = 1; page <= MAX_PAGES_COMMANDES; page++) {
        const lot = await lire<CommandeWoo[]>(`/orders?modified_after=${encodeURIComponent(depuis)}&dates_are_gmt=true&per_page=100&page=${page}&status=any&_fields=id,number,status,date_modified_gmt,line_items`);
        brutes.push(...lot);
        if (lot.length < 100) break;
      }
      // Plus ancien d'abord : une commande reçue puis annulée dans le même lot est traitée dans le bon ordre.
      brutes.sort((a, b) => (a.date_modified_gmt ?? "").localeCompare(b.date_modified_gmt ?? ""));
      const commandes: CommandeExterne[] = [];
      let nouveau = curseur;
      for (const c of brutes) {
        const statut = (c.status ?? "").toLowerCase();
        const lignes = (c.line_items ?? [])
          .filter((l) => (l.quantity ?? 0) > 0)
          .map((l) => ({ code: (l.sku ?? "").trim() || `SANS-SKU : ${(l.name ?? "article").slice(0, 60)}`, quantite: Math.floor(l.quantity!) }));
        const action = SORTENT.has(statut) ? "ENREGISTRER" : RETOURNENT.has(statut) ? "ANNULER" : null;
        if (action && lignes.length > 0) commandes.push({ reference: String(c.number ?? c.id), action, lignes });
        const modifiee = c.date_modified_gmt ? `${c.date_modified_gmt}Z` : null;
        if (modifiee && modifiee > nouveau) nouveau = modifiee;
      }
      return { commandes, curseur: nouveau };
    },

    async produits() {
      const resultat: { idExterne: string; code: string }[] = [];
      for (let page = 1; page <= MAX_PAGES_PRODUITS; page++) {
        const lot = await lire<ProduitWoo[]>(`/products?per_page=100&page=${page}&_fields=id,sku,type`);
        for (const p of lot) {
          // Un produit à variantes n'a pas de stock à lui (les variantes ont leur propre référence) : non géré pour l'instant.
          if (p.sku && p.sku.trim() && p.type !== "variable") resultat.push({ idExterne: String(p.id), code: p.sku.trim() });
        }
        if (lot.length < 100) break;
      }
      return resultat;
    },

    async poserStock(lots) {
      const misAJour: string[] = [];
      let echecs = 0;
      for (let i = 0; i < lots.length; i += TAILLE_LOT) {
        const morceau = lots.slice(i, i + TAILLE_LOT);
        const r = await appeler(`${api}/products/batch`, {
          methode: "POST",
          entetes,
          corps: JSON.stringify({ update: morceau.map((l) => ({ id: Number(l.idExterne), manage_stock: true, stock_quantity: Math.max(0, Math.floor(l.quantite)) })) }),
        });
        if (r.statut === 401 || r.statut === 403) throw new ErreurPlateforme(m("WooCommerce refuse de modifier le stock : vos clés doivent avoir les droits « Lecture/Écriture »."));
        if (r.statut !== 200 && r.statut !== 201) {
          echecs += morceau.length;
          continue;
        }
        try {
          const corps = JSON.parse(r.corps) as { update?: { id: number; error?: unknown }[] };
          const erreurs = new Set((corps.update ?? []).filter((u) => u.error).map((u) => String(u.id)));
          for (const l of morceau) {
            if (erreurs.has(l.idExterne)) echecs += 1;
            else misAJour.push(l.idExterne);
          }
        } catch {
          echecs += morceau.length;
        }
      }
      return { misAJour, echecs };
    },
  };
}
