// Abonnement plat unique 50 000 FCFA/mois (2026-09-14) — remplace les
// forfaits starter/pro/business et les add-ons à la carte : une entreprise
// qui n'est pas suspendue a accès à tout. Axe indépendant de peut()/portee()
// (src/lib/permissions.ts) : celui-ci définit ce que l'ENTREPRISE a le droit
// d'utiliser (verrouillage suspendu/non suspendu), pas ce qu'un utilisateur
// donné peut faire.
//
// disponible()/disponibleAddon() gardent leur signature d'origine (types
// Fonctionnalite/Addon toujours utilisés comme littéraux typés à travers le
// produit) pour ne toucher AUCUN des 47 + 15 points d'appel existants —
// seul leur comportement interne change. Le vrai verrouillage passe
// désormais uniquement par entreprise.statutAbonnement, piloté par
// src/lib/abonnement/etat.ts et src/worker/tasks/traiter-abonnement-entreprise.ts.

import type { TransactionDrizzle } from "@/db/client";

export type Fonctionnalite =
  | "CRM"
  | "FACTURATION"
  | "PAIEMENTS_EN_LIGNE"
  | "DOSSIERS"
  | "PROJETS"
  | "CHAT_INTERNE"
  | "SIGNATURE_ELECTRONIQUE"
  | "CONTRATS"
  | "COMPTABILITE_COMPLETE"
  | "RH";

export function disponible(entreprise: { planAbonnement: string; statutAbonnement: string }, _fonctionnalite: Fonctionnalite): boolean {
  return entreprise.statutAbonnement !== "suspendu";
}

// Add-ons à la carte : plus vendus séparément depuis l'abonnement plat —
// src/lib/actions/addon.ts et la table addonActif restent en place, inertes
// (aucune UI ne les active plus), jamais supprimés pour éviter un churn
// inutile. Le type Addon reste utilisé comme littéral typé aux 15 points
// d'appel existants.
export type Addon = "MARKETING" | "FACTURATION_ABONNEMENTS" | "RESERVATIONS" | "RECRUTEMENT" | "SUPPORT";

export async function disponibleAddon(_tx: TransactionDrizzle, entreprise: { id: string; statutAbonnement: string }, _addon: Addon): Promise<boolean> {
  return entreprise.statutAbonnement !== "suspendu";
}
