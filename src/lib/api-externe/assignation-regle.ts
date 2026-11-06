import { z } from "zod";

/**
 * À qui va un prospect reçu d'un site connecté ou d'une page Facebook (2026-11-06). Choisi par l'Administrateur pour CHAQUE clé d'API et
 * CHAQUE page Facebook ; absent (null) = le premier administrateur actif, comme avant. Pur : aucun accès à la base ici (la base le
 * vérifie dans `assignation.ts`), donc utilisable aussi côté navigateur.
 *
 * - PERSONNE : toujours cette personne (typiquement un Manager).
 * - REPARTITION : tour de rôle entre plusieurs personnes (celle qui a reçu le moins de prospects de sites ces 30 derniers jours).
 */
export type RegleAssignation = { mode: "PERSONNE"; utilisateurId: string } | { mode: "REPARTITION"; utilisateurIds: string[] };

/** Ce que le navigateur envoie : « ADMIN » (premier administrateur, par défaut) ou une règle. */
export type ChoixAssignation = { mode: "ADMIN" } | RegleAssignation;

export const MAX_RECEVEURS_REPARTITION = 20;

const identifiant = z.string().trim().min(1).max(64);

const schemaChoix = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("ADMIN") }),
  z.object({ mode: z.literal("PERSONNE"), utilisateurId: identifiant }),
  z.object({ mode: z.literal("REPARTITION"), utilisateurIds: z.array(identifiant).min(2).max(MAX_RECEVEURS_REPARTITION) }),
]);

/** Lit une valeur inconnue (navigateur) : le choix valide, ou null. Les doublons d'une répartition sont retirés, l'ordre est conservé. */
export function lireChoixAssignation(brut: unknown): ChoixAssignation | null {
  const analyse = schemaChoix.safeParse(brut);
  if (!analyse.success) return null;
  if (analyse.data.mode === "REPARTITION") {
    const ids = [...new Set(analyse.data.utilisateurIds)];
    return ids.length >= 2 ? { mode: "REPARTITION", utilisateurIds: ids } : null;
  }
  return analyse.data;
}

/** Lit la règle enregistrée en base (colonne JSON) : null si absente ou illisible, donc retour au premier administrateur, jamais une erreur. */
export function lireRegleEnregistree(brut: unknown): RegleAssignation | null {
  const choix = lireChoixAssignation(brut);
  return choix && choix.mode !== "ADMIN" ? choix : null;
}

/** La valeur à enregistrer en base pour un choix : null pour « premier administrateur ». */
export function regleDepuisChoix(choix: ChoixAssignation): RegleAssignation | null {
  return choix.mode === "ADMIN" ? null : choix;
}

/**
 * Parmi `candidats` (dans l'ordre de la liste), celui qui a reçu le moins de prospects ; à égalité, le premier de la liste. `comptes` donne le
 * nombre de prospects déjà reçus par personne (absent = 0). Renvoie null si la liste est vide.
 */
export function choisirParTourDeRole(candidats: string[], comptes: Map<string, number>): string | null {
  let meilleur: string | null = null;
  let min = Infinity;
  for (const id of candidats) {
    const n = comptes.get(id) ?? 0;
    if (n < min) {
      min = n;
      meilleur = id;
    }
  }
  return meilleur;
}
