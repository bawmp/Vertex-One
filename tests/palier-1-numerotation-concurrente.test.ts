import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise } from "@/db/schema";
import { genererNumeroFacture, genererNumeroDevis } from "@/lib/facturation/numerotation";

/**
 * Docs/palier-1-*, section 5 — "le point le plus strict" : la numérotation
 * doit être unique, continue et chronologique, sans aucun trou, y compris
 * quand deux requêtes tentent d'obtenir un numéro au même instant. Ce test
 * simule N créations réellement simultanées (Promise.all, pas une boucle
 * séquentielle) sur la même entreprise et vérifie l'absence de doublon et de
 * trou dans la séquence obtenue.
 */
describe("Palier 1 — numérotation séquentielle sous concurrence réelle", () => {
  let entrepriseId: string;
  const NB_CONCURRENTES = 20;

  beforeAll(async () => {
    const [e] = await db
      .insert(entreprise)
      .values({ nom: "TEST Concurrence Facturation", secteurProfil: "generique" })
      .returning({ id: entreprise.id });
    entrepriseId = e.id;
    // Timeout élargi (au-delà des 10s par défaut) : la toute première
    // connexion WebSocket qu'un process vitest établit vers Neon peut
    // prendre jusqu'à ~13-15s (voir CLAUDE.md, latence Neon) — se
    // manifeste précisément ici quand ce fichier tourne seul ou en tête de
    // file, avant qu'aucune autre requête n'ait pu réchauffer le pool.
  }, 30_000);

  afterAll(async () => {
    await db.delete(entreprise).where(eq(entreprise.id, entrepriseId));
  }, 30_000);

  test(
    `${NB_CONCURRENTES} générations de numéro de facture en parallèle produisent des numéros uniques et sans trou`,
    async () => {
      const numeros = await Promise.all(
        Array.from({ length: NB_CONCURRENTES }, () =>
          avecEntreprise(entrepriseId, (tx) => genererNumeroFacture(tx, entrepriseId))
        )
      );

      const uniques = new Set(numeros);
      expect(uniques.size).toBe(NB_CONCURRENTES);

      const annee = new Date().getFullYear();
      const compteurs = numeros
        .map((n) => Number(n.replace(`FAC-${annee}-`, "")))
        .sort((a, b) => a - b);

      expect(compteurs).toEqual(Array.from({ length: NB_CONCURRENTES }, (_, i) => i + 1));
    },
    // 30s par défaut insuffisant : les 20 transactions concurrentes sont
    // sérialisées par le verrou de ligne (UPDATE ... RETURNING atomique sur
    // le même compteur), donc leur coût s'additionne plutôt que de se
    // paralléliser — constaté réellement, pas anticipé (timeout à 30s avec
    // un seul test resté "pending" alors que le second, dans la même suite,
    // passait sans souci).
    60_000
  );

  test(
    "la numérotation des devis est indépendante de celle des factures",
    async () => {
      const [numeroDevis, numeroFacture] = await Promise.all([
        avecEntreprise(entrepriseId, (tx) => genererNumeroDevis(tx, entrepriseId)),
        avecEntreprise(entrepriseId, (tx) => genererNumeroFacture(tx, entrepriseId)),
      ]);

      expect(numeroDevis).toMatch(/^DEV-\d{4}-000001$/);
      // La facture continue la séquence des 20 précédentes du test ci-dessus.
      expect(numeroFacture).toMatch(/^FAC-\d{4}-000021$/);
    },
    // Même raison que le test précédent (30s par défaut insuffisant sous
    // cette latence) : constaté réellement, ce test dépassait le budget par
    // défaut alors qu'il n'exécute que deux transactions.
    60_000
  );
});
