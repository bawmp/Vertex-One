import type { badgeVariants } from "@/components/ui/badge";
import type { VariantProps } from "class-variance-authority";

export type VarianteBadge = NonNullable<VariantProps<typeof badgeVariants>["variant"]>;

// Source unique du mapping statut → (libellé, couleur), pour que le CRM, la
// liste de facturation, les fiches détail et le tableau de bord affichent
// tous exactement la même sémantique de couleur pour un même statut.
// Reconstruction Leads/Contacts/Comptes/Deals sur le modèle de Zoho CRM
// (échange du 2026-09-06) — remplace STATUT_PROSPECT.
export const STATUT_LEAD: Record<string, { libelle: string; variante: VarianteBadge }> = {
  NOUVEAU: { libelle: "Nouveau", variante: "info" },
  CONTACTE: { libelle: "Contacté", variante: "info" },
  QUALIFIE: { libelle: "Qualifié", variante: "success" },
  DISQUALIFIE: { libelle: "Disqualifié", variante: "danger" },
};

export const STATUT_DEAL: Record<string, { libelle: string; variante: VarianteBadge }> = {
  QUALIFICATION: { libelle: "Qualification", variante: "info" },
  PROPOSITION: { libelle: "Proposition", variante: "warning" },
  NEGOCIATION: { libelle: "Négociation", variante: "warning" },
  GAGNE: { libelle: "Gagné", variante: "success" },
  PERDU: { libelle: "Perdu", variante: "danger" },
};

// Activités CRM (Accueil, inspiré de Zoho CRM, échange du 2026-09-06).
export const STATUT_TACHE_CRM: Record<string, { libelle: string; variante: VarianteBadge }> = {
  NON_COMMENCEE: { libelle: "Non commencé", variante: "neutral" },
  EN_COURS: { libelle: "En cours", variante: "info" },
  TERMINEE: { libelle: "Terminée", variante: "success" },
  DIFFEREE: { libelle: "Différée", variante: "warning" },
};

export const PRIORITE_TACHE_CRM: Record<string, { libelle: string; variante: VarianteBadge }> = {
  BASSE: { libelle: "Basse", variante: "neutral" },
  NORMALE: { libelle: "Normale", variante: "info" },
  HAUTE: { libelle: "Haute", variante: "danger" },
};

export const STATUT_DEVIS: Record<string, { libelle: string; variante: VarianteBadge }> = {
  BROUILLON: { libelle: "Brouillon", variante: "neutral" },
  ENVOYE: { libelle: "Envoyé", variante: "info" },
  ACCEPTE: { libelle: "Accepté", variante: "success" },
  REFUSE: { libelle: "Refusé", variante: "danger" },
  EXPIRE: { libelle: "Expiré", variante: "warning" },
};

export const STATUT_FACTURE: Record<string, { libelle: string; variante: VarianteBadge }> = {
  EMISE: { libelle: "Émise", variante: "info" },
  PARTIELLEMENT_PAYEE: { libelle: "Partiellement payée", variante: "warning" },
  PAYEE: { libelle: "Payée", variante: "success" },
  EN_RETARD: { libelle: "En retard", variante: "danger" },
  ANNULEE: { libelle: "Annulée", variante: "neutral" },
};

// Cycle Achats, deuxième tranche (échange du 2026-09-07).
export const STATUT_FACTURE_FOURNISSEUR: Record<string, { libelle: string; variante: VarianteBadge }> = {
  EN_ATTENTE: { libelle: "En attente", variante: "info" },
  PARTIELLEMENT_PAYEE: { libelle: "Partiellement payée", variante: "warning" },
  PAYEE: { libelle: "Payée", variante: "success" },
  ANNULEE: { libelle: "Annulée", variante: "neutral" },
};

export const STATUT_DOSSIER: Record<string, { libelle: string; variante: VarianteBadge }> = {
  ACTIF: { libelle: "Actif", variante: "success" },
  ARCHIVE: { libelle: "Archivé", variante: "neutral" },
};

export const STATUT_PROJET: Record<string, { libelle: string; variante: VarianteBadge }> = {
  A_FAIRE: { libelle: "À faire", variante: "neutral" },
  EN_COURS: { libelle: "En cours", variante: "info" },
  EN_REVISION: { libelle: "En révision", variante: "warning" },
  TERMINE: { libelle: "Terminé", variante: "success" },
  ANNULE: { libelle: "Annulé", variante: "danger" },
};

export const STATUT_TACHE: Record<string, { libelle: string; variante: VarianteBadge }> = {
  A_FAIRE: { libelle: "À faire", variante: "neutral" },
  EN_COURS: { libelle: "En cours", variante: "info" },
  TERMINEE: { libelle: "Terminée", variante: "success" },
};
