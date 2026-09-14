import { describe, test, expect } from "vitest";
import { eq } from "drizzle-orm";
import { entreprise } from "@/db/schema";
import { dbPlateforme } from "@/db/plateforme";

/**
 * Console interne plateforme (2026-09-14) — la vraie garantie de sécurité de
 * ce module n'est pas une vérification applicative (qui pourrait avoir un
 * bug un jour), c'est le rôle Postgres plateforme_lecture lui-même :
 * GRANT SELECT uniquement, aucun GRANT INSERT/UPDATE/DELETE. Ce test le
 * prouve directement contre la base réelle, pas par une supposition sur le
 * code applicatif.
 */
describe("Rôle plateforme_lecture — écriture structurellement impossible", () => {
  test("une lecture cross-tenant réussit (BYPASSRLS)", async () => {
    const lignes = await dbPlateforme.select({ id: entreprise.id }).from(entreprise).limit(1);
    expect(Array.isArray(lignes)).toBe(true);
  });

  test("un INSERT est rejeté par Postgres lui-même, pas par l'application", async () => {
    // Drizzle enveloppe l'erreur ("Failed query: ...") — le vrai message
    // Postgres ("permission denied") vit dans .cause, pas dans .message.
    await expect(dbPlateforme.insert(entreprise).values({ nom: "TEST Ecriture Refusee Plateforme", secteurProfil: "agence" })).rejects.toMatchObject({
      cause: { message: expect.stringMatching(/permission denied/i) },
    });
  });

  test("un UPDATE est rejeté par Postgres lui-même", async () => {
    // Ciblé sur un id inexistant à dessein — même si les droits étaient un
    // jour mal configurés, ce test ne doit jamais pouvoir modifier une vraie
    // ligne ; permission denied doit de toute façon survenir avant même
    // d'évaluer le WHERE.
    await expect(dbPlateforme.update(entreprise).set({ nom: "PIRATE" }).where(eq(entreprise.id, "id-inexistant-test-plateforme"))).rejects.toMatchObject({
      cause: { message: expect.stringMatching(/permission denied/i) },
    });
  });
});
