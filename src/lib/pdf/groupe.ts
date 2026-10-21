import { eq } from "drizzle-orm";
import type { TransactionDrizzle } from "@/db/client";
import { groupe } from "@/db/schema";

/**
 * Mention « groupe » des documents PDF (2026-10-21) : une entreprise rattachée à un groupe (voir `groupe`, src/db/schema.ts)
 * l'affiche dans l'en-tête de ses devis, factures, bons de commande, reçus et certificats de signature — ex. « Global
 * Mobility », « Une entreprise du groupe Vertex Technology ». Entièrement piloté par les données : aucun nom n'est
 * écrit en dur, et l'entreprise qui porte le même nom que son groupe n'affiche rien (inutile de se citer elle-même).
 */
function normaliser(texte: string): string {
  return texte
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Nom du groupe à afficher, ou null (pas de groupe, ou même nom que l'entreprise). */
export function nomGroupeAAfficher(entrepriseNom: string, groupeNom: string | null | undefined): string | null {
  const nom = groupeNom?.trim();
  if (!nom) return null;
  return normaliser(nom) === normaliser(entrepriseNom) ? null : nom;
}

/** Libellé de la mention, ou null. */
export function mentionGroupe(entrepriseNom: string, groupeNom: string | null | undefined): string | null {
  const nom = nomGroupeAAfficher(entrepriseNom, groupeNom);
  return nom ? `Une entreprise du groupe ${nom}` : null;
}

/** `groupe` n'a pas de RLS (voir son commentaire) : la lecture par identifiant déjà connu est volontairement sans contrainte. */
export async function groupeNomPourPDF(tx: TransactionDrizzle, entrepriseNom: string, groupeId: string | null): Promise<string | null> {
  if (!groupeId) return null;
  const [g] = await tx.select({ nom: groupe.nom }).from(groupe).where(eq(groupe.id, groupeId));
  return nomGroupeAAfficher(entrepriseNom, g?.nom);
}
