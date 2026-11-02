/**
 * Rôles qui ne sont PAS des collègues : un client du portail et un comptable externe. Ils ne figurent ni dans les listes d'équipe, ni
 * dans le chat, ni dans les affectations, et ne comptent pas parmi les utilisateurs facturés. À utiliser à la place de « role ≠ CLIENT »
 * pour toute liste de collègues.
 */
export const ROLES_NON_COLLEGUES = ["CLIENT", "COMPTABLE"] as const;
