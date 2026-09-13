// Verrouillage des fonctionnalités par abonnement — voir docs/strategie-suite-locale-entreprises-services.md,
// section "Le verrouillage des fonctionnalités par abonnement". Axe indépendant de peut()/portee() (src/lib/permissions.ts) :
// celui-ci définit ce que l'ENTREPRISE a le droit d'utiliser selon son forfait, pas ce qu'un utilisateur donné peut faire.

import { eq, and } from "drizzle-orm";
import type { TransactionDrizzle } from "@/db/client";
import { addonActif } from "@/db/schema";

export type Fonctionnalite =
  | "CRM"
  | "FACTURATION"
  | "PAIEMENTS_EN_LIGNE" // lien NotchPay + réconciliation automatique
  | "DOSSIERS"
  | "PROJETS"
  | "CHAT_INTERNE"
  | "SIGNATURE_ELECTRONIQUE"
  | "CONTRATS"
  | "COMPTABILITE_COMPLETE"
  | "RH";

// DOSSIERS et PROJETS verrouillés ensemble au même palier (Pro) — voir
// docs/palier-2-*, section 6. Rien n'empêche de les séparer plus tard si un
// profil de client veut l'un sans l'autre, mais ce n'est pas un besoin
// identifié à ce stade.
export const FONCTIONNALITES_PAR_PLAN: Record<string, Fonctionnalite[]> = {
  essai: ["CRM", "FACTURATION", "PAIEMENTS_EN_LIGNE", "DOSSIERS", "PROJETS", "CHAT_INTERNE"], // tout ouvert pour convaincre
  starter: ["CRM", "FACTURATION"],
  pro: ["CRM", "FACTURATION", "PAIEMENTS_EN_LIGNE", "DOSSIERS", "PROJETS", "CHAT_INTERNE"],
  business: [
    "CRM",
    "FACTURATION",
    "PAIEMENTS_EN_LIGNE",
    "DOSSIERS",
    "PROJETS",
    "CHAT_INTERNE",
    "SIGNATURE_ELECTRONIQUE",
    "CONTRATS",
    "COMPTABILITE_COMPLETE",
    "RH",
  ],
};

export function disponible(
  entreprise: { planAbonnement: string; statutAbonnement: string },
  fonctionnalite: Fonctionnalite
): boolean {
  if (entreprise.statutAbonnement === "suspendu") return false;
  return FONCTIONNALITES_PAR_PLAN[entreprise.planAbonnement]?.includes(fonctionnalite) ?? false;
}

// Modules complémentaires vendus à la carte, indépendamment du forfait —
// docs/palier-6-*, section 5 ; docs/strategie-*, section 7 : "Modules
// complémentaires (support, marketing, stock) — en options à l'unité".
// Fonction séparée plutôt qu'une extension de disponible() elle-même : le
// document suggère de rendre disponible() asynchrone pour interroger
// AddonActif, mais ça aurait forcé à modifier chacun des ~15 appels
// synchrones déjà en production dans ce projet pour un bénéfice nul sur les
// fonctionnalités gated par forfait — un deuxième axe orthogonal reste plus
// sûr ("sans rien casser de ce qui existe déjà", exactement l'exigence posée
// par la section 5).
export type Addon = "MARKETING" | "FACTURATION_ABONNEMENTS" | "RESERVATIONS" | "RECRUTEMENT";

export async function disponibleAddon(
  tx: TransactionDrizzle,
  entreprise: { id: string; statutAbonnement: string },
  addon: Addon
): Promise<boolean> {
  if (entreprise.statutAbonnement === "suspendu") return false;

  const [ligne] = await tx
    .select({ id: addonActif.id })
    .from(addonActif)
    .where(and(eq(addonActif.entrepriseId, entreprise.id), eq(addonActif.addon, addon)));

  return Boolean(ligne);
}
