import { m } from "@/lib/i18n/catalogue";

/** Transfert d'un employé entre deux entreprises du même groupe : règles pures (sans accès base), utilisables dans le navigateur. */
export type StatutTransfert = "EN_ATTENTE" | "ACCEPTE" | "REFUSE" | "ANNULE";

export const STATUT_TRANSFERT: Record<StatutTransfert, { libelle: string; variante: "info" | "success" | "danger" | "neutral" }> = {
  EN_ATTENTE: { libelle: m("En attente de réponse"), variante: "info" },
  ACCEPTE: { libelle: m("Transfert effectué"), variante: "success" },
  REFUSE: { libelle: m("Refusé"), variante: "danger" },
  ANNULE: { libelle: m("Annulé"), variante: "neutral" },
};

/** Rôles transférables : un Administrateur ne se transfère pas (l'entreprise d'origine se retrouverait sans administrateur), ni un client du portail. */
export const ROLES_TRANSFERABLES = ["EMPLOYE", "MANAGER"] as const;
export const LONGUEUR_MESSAGE_MAX = 500;

export function roleTransferable(role: string): boolean {
  return (ROLES_TRANSFERABLES as readonly string[]).includes(role);
}

/** Nettoie un texte libre (message de la proposition, motif du refus) : espaces, longueur. */
export function validerTexteTransfert(brut: string): { ok: true; texte: string | null } | { ok: false; erreur: string } {
  const texte = brut.trim();
  if (texte.length > LONGUEUR_MESSAGE_MAX) return { ok: false, erreur: m("Le message est limité à 500 caractères.") };
  return { ok: true, texte: texte || null };
}

/**
 * Adresse de remplacement du compte laissé dans l'entreprise d'origine : l'adresse réelle est unique dans toute la base et passe au nouveau
 * compte. Le domaine « .invalid » ne peut jamais recevoir de courrier ; l'identifiant garde l'adresse unique.
 */
export function emailArchive(ancienUtilisateurId: string): string {
  return `transfere-${ancienUtilisateurId}@archive.vertexone.invalid`;
}
