import { z } from "zod";

/**
 * Couleur de marque (échange du 2026-09-13) — injectée telle quelle dans une
 * valeur CSS (--primary et les jetons sidebar découplés, voir globals.css)
 * côté layout, donc un format autre qu'un hex strict à 6 chiffres ne doit
 * jamais être accepté. Isolé de src/lib/actions/entreprise-branding.ts (qui
 * porte "use server") pour rester testable directement en Vitest.
 */
export const schemaCouleur = z.object({
  couleurMarque: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "La couleur doit être un code hexadécimal valide (ex. #0f766e)."),
});
