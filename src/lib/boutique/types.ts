/**
 * Contrat commun des plateformes de vente en ligne (2026-11-12). Le moteur de synchronisation (`synchro.ts`) ne connaît que ceci : pour
 * ajouter une plateforme (PrestaShop, Shopify…), il suffit d'écrire un adaptateur qui respecte ce contrat, sans toucher au stock, à
 * l'écran ni au worker.
 */
export type LigneExterne = { code: string; quantite: number };

/** Une commande du site, déjà ramenée au vocabulaire de Vertex One. */
export type CommandeExterne = {
  reference: string;
  /** ENREGISTRER : la commande est payée ou en cours de traitement, le stock doit sortir. ANNULER : annulée/remboursée, le stock revient. */
  action: "ENREGISTRER" | "ANNULER";
  lignes: LigneExterne[];
};

export type ProduitExterne = { idExterne: string; code: string };

export type ResultatTest = { ok: true } | { ok: false; erreur: string };

export interface Adaptateur {
  /** Vérifie que les identifiants fonctionnent, avec un message SIMPLE (jamais un code technique) sinon. */
  tester(): Promise<ResultatTest>;
  /**
   * Commandes créées ou modifiées depuis `curseur` (null = depuis l'instant de la connexion, voir le moteur). Renvoie aussi le nouveau
   * curseur. Un petit chevauchement est permis : les doublons sont absorbés par l'idempotence du stock.
   */
  commandesDepuis(curseur: string): Promise<{ commandes: CommandeExterne[]; curseur: string }>;
  /** Les produits du site qui ont une référence (SKU). Les variantes ne sont pas gérées : seuls les produits simples sont listés. */
  produits(): Promise<ProduitExterne[]>;
  /** Fixe le stock de chaque produit ; renvoie les identifiants réellement mis à jour. */
  poserStock(lots: { idExterne: string; quantite: number }[]): Promise<{ misAJour: string[]; echecs: number }>;
}

export type TypeConnexion = "WOOCOMMERCE" | "FICHIER";

/** Erreur dont le message est déjà écrit pour l'Administrateur. */
export class ErreurPlateforme extends Error {}
