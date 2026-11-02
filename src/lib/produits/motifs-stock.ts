import { m } from "@/lib/i18n/catalogue";

// Séparé de stock.ts pour que le navigateur puisse lire les listes sans embarquer le code de base de données.
/** Motifs proposés pour une correction à la main (liste fermée, validée côté serveur). La clé est enregistrée, le libellé s'affiche. */
export const MOTIFS_AJOUT = {
  RECEPTION: m("Réception de marchandise"),
  RETOUR_CLIENT: m("Retour d'un client"),
  TROUVE: m("Article retrouvé"),
  AUTRE: m("Autre raison"),
} as const;

export const MOTIFS_RETRAIT = {
  CASSE: m("Casse ou produit abîmé"),
  PERTE: m("Perte"),
  VOL: m("Vol"),
  PERIME: m("Produit périmé"),
  USAGE_INTERNE: m("Usage interne ou échantillon"),
  AUTRE: m("Autre raison"),
} as const;

export const MOTIFS_INVENTAIRE = {
  INVENTAIRE: m("Inventaire physique"),
} as const;
