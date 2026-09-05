// Verrouillage des fonctionnalités par abonnement — voir docs/strategie-suite-locale-entreprises-services.md,
// section "Le verrouillage des fonctionnalités par abonnement". Axe indépendant de peut()/portee() (src/lib/permissions.ts) :
// celui-ci définit ce que l'ENTREPRISE a le droit d'utiliser selon son forfait, pas ce qu'un utilisateur donné peut faire.

export type Fonctionnalite =
  | "CRM"
  | "FACTURATION"
  | "PAIEMENTS_EN_LIGNE" // lien NotchPay + réconciliation automatique
  | "PROJETS"
  | "CHAT_INTERNE"
  | "SIGNATURE_ELECTRONIQUE"
  | "COMPTABILITE_COMPLETE"
  | "RH";

export const FONCTIONNALITES_PAR_PLAN: Record<string, Fonctionnalite[]> = {
  essai: ["CRM", "FACTURATION", "PAIEMENTS_EN_LIGNE", "PROJETS", "CHAT_INTERNE"], // tout ouvert pour convaincre
  starter: ["CRM", "FACTURATION"],
  pro: ["CRM", "FACTURATION", "PAIEMENTS_EN_LIGNE", "PROJETS", "CHAT_INTERNE"],
  business: [
    "CRM",
    "FACTURATION",
    "PAIEMENTS_EN_LIGNE",
    "PROJETS",
    "CHAT_INTERNE",
    "SIGNATURE_ELECTRONIQUE",
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
