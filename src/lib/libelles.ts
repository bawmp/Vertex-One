import { m } from "@/lib/i18n/catalogue";
import type { badgeVariants } from "@/components/ui/badge";
import type { VariantProps } from "class-variance-authority";

export type VarianteBadge = NonNullable<VariantProps<typeof badgeVariants>["variant"]>;

// Source unique du mapping statut → (libellé, couleur), pour que le CRM, la
// liste de facturation, les fiches détail et le tableau de bord affichent
// tous exactement la même sémantique de couleur pour un même statut.
// Reconstruction Leads/Contacts/Comptes/Deals sur le modèle de Zoho CRM
// (échange du 2026-09-06) — remplace STATUT_PROSPECT.
export const STATUT_LEAD: Record<string, { libelle: string; variante: VarianteBadge }> = {
  NOUVEAU: { libelle: m("Nouveau"), variante: "info" },
  CONTACTE: { libelle: m("Contacté"), variante: "info" },
  QUALIFIE: { libelle: m("Qualifié"), variante: "success" },
  DISQUALIFIE: { libelle: m("Disqualifié"), variante: "danger" },
};

export const STATUT_DEAL: Record<string, { libelle: string; variante: VarianteBadge }> = {
  QUALIFICATION: { libelle: m("Qualification"), variante: "info" },
  PROPOSITION: { libelle: m("Proposition"), variante: "warning" },
  NEGOCIATION: { libelle: m("Négociation"), variante: "warning" },
  GAGNE: { libelle: m("Gagné"), variante: "success" },
  PERDU: { libelle: m("Perdu"), variante: "danger" },
};

// Activités CRM (Accueil, inspiré de Zoho CRM, échange du 2026-09-06).
export const STATUT_TACHE_CRM: Record<string, { libelle: string; variante: VarianteBadge }> = {
  NON_COMMENCEE: { libelle: m("Non commencé"), variante: "neutral" },
  EN_COURS: { libelle: m("En cours"), variante: "info" },
  TERMINEE: { libelle: m("Terminée"), variante: "success" },
  DIFFEREE: { libelle: m("Différée"), variante: "warning" },
};

export const PRIORITE_TACHE_CRM: Record<string, { libelle: string; variante: VarianteBadge }> = {
  BASSE: { libelle: m("Basse"), variante: "neutral" },
  NORMALE: { libelle: m("Normale"), variante: "info" },
  HAUTE: { libelle: m("Haute"), variante: "danger" },
};

export const STATUT_DEVIS: Record<string, { libelle: string; variante: VarianteBadge }> = {
  BROUILLON: { libelle: m("Brouillon"), variante: "neutral" },
  ENVOYE: { libelle: m("Envoyé"), variante: "info" },
  ACCEPTE: { libelle: m("Accepté"), variante: "success" },
  REFUSE: { libelle: m("Refusé"), variante: "danger" },
  EXPIRE: { libelle: m("Expiré"), variante: "warning" },
};

export const STATUT_FACTURE: Record<string, { libelle: string; variante: VarianteBadge }> = {
  EMISE: { libelle: m("Émise"), variante: "info" },
  PARTIELLEMENT_PAYEE: { libelle: m("Partiellement payée"), variante: "warning" },
  PAYEE: { libelle: m("Payée"), variante: "success" },
  EN_RETARD: { libelle: m("En retard"), variante: "danger" },
  ANNULEE: { libelle: m("Annulée"), variante: "neutral" },
};

// Cycle Achats, deuxième tranche (échange du 2026-09-07).
export const STATUT_FACTURE_FOURNISSEUR: Record<string, { libelle: string; variante: VarianteBadge }> = {
  EN_ATTENTE: { libelle: m("En attente"), variante: "info" },
  PARTIELLEMENT_PAYEE: { libelle: m("Partiellement payée"), variante: "warning" },
  PAYEE: { libelle: m("Payée"), variante: "success" },
  ANNULEE: { libelle: m("Annulée"), variante: "neutral" },
};

// Cycle Achats, troisième tranche (échange du 2026-09-07).
export const STATUT_BON_COMMANDE_ACHAT: Record<string, { libelle: string; variante: VarianteBadge }> = {
  BROUILLON: { libelle: m("Brouillon"), variante: "neutral" },
  FACTURE: { libelle: m("Facturé"), variante: "success" },
  ANNULE: { libelle: m("Annulé"), variante: "danger" },
};

// Extensions Ventes (échange du 2026-09-07).
export const STATUT_BON_COMMANDE_VENTE: Record<string, { libelle: string; variante: VarianteBadge }> = {
  BROUILLON: { libelle: m("Brouillon"), variante: "neutral" },
  FACTURE: { libelle: m("Facturé"), variante: "success" },
  ANNULE: { libelle: m("Annulé"), variante: "danger" },
};

// Extensions Ventes, Factures récurrentes (échange du 2026-09-07).
export const STATUT_FACTURE_RECURRENTE: Record<string, { libelle: string; variante: VarianteBadge }> = {
  ACTIF: { libelle: m("Actif"), variante: "success" },
  EN_PAUSE: { libelle: m("En pause"), variante: "warning" },
  TERMINE: { libelle: m("Terminé"), variante: "neutral" },
};

export const FREQUENCE_FACTURE_RECURRENTE: Record<string, { libelle: string; variante: VarianteBadge }> = {
  MENSUEL: { libelle: m("Mensuel"), variante: "info" },
  TRIMESTRIEL: { libelle: m("Trimestriel"), variante: "info" },
  ANNUEL: { libelle: m("Annuel"), variante: "info" },
};

// Extensions Ventes, Reçus de vente (échange du 2026-09-07).
export const STATUT_RECU_VENTE: Record<string, { libelle: string; variante: VarianteBadge }> = {
  EMISE: { libelle: m("Émis"), variante: "success" },
  ANNULE: { libelle: m("Annulé"), variante: "danger" },
};

// Extensions Ventes, Factures d'acompte (échange du 2026-09-07).
export const STATUT_FACTURE_ACOMPTE: Record<string, { libelle: string; variante: VarianteBadge }> = {
  EMISE: { libelle: m("En attente de paiement"), variante: "info" },
  PAYEE: { libelle: m("Encaissé"), variante: "warning" },
  APPLIQUEE: { libelle: m("Appliqué"), variante: "success" },
  ANNULEE: { libelle: m("Annulé"), variante: "neutral" },
};

export const STATUT_DOSSIER: Record<string, { libelle: string; variante: VarianteBadge }> = {
  ACTIF: { libelle: m("Actif"), variante: "success" },
  ARCHIVE: { libelle: m("Archivé"), variante: "neutral" },
};

export const STATUT_PROJET: Record<string, { libelle: string; variante: VarianteBadge }> = {
  A_FAIRE: { libelle: m("À faire"), variante: "neutral" },
  EN_COURS: { libelle: m("En cours"), variante: "info" },
  EN_REVISION: { libelle: m("En révision"), variante: "warning" },
  TERMINE: { libelle: m("Terminé"), variante: "success" },
  ANNULE: { libelle: m("Annulé"), variante: "danger" },
};

export const STATUT_TACHE: Record<string, { libelle: string; variante: VarianteBadge }> = {
  A_FAIRE: { libelle: m("À faire"), variante: "neutral" },
  EN_COURS: { libelle: m("En cours"), variante: "info" },
  TERMINEE: { libelle: m("Terminée"), variante: "success" },
};
