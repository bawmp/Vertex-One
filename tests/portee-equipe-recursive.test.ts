import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, utilisateur } from "@/db/schema";
import { idsVisibles } from "@/lib/portee";
import type { UtilisateurConnecte } from "@/lib/session";

/**
 * Portée "EQUIPE" multi-niveaux (2026-09-15) — corrige un bug réel : la
 * version précédente ne remontait qu'un seul niveau de management (voir
 * src/lib/portee.ts), et de toute façon aucune interface ne permettait de
 * renseigner utilisateur.managerId avant ce chantier, rendant la portée
 * EQUIPE inerte en pratique.
 */
describe("Portée EQUIPE — hiérarchie multi-niveaux", () => {
  let entrepriseId: string;
  let autreEntrepriseId: string;
  let aId: string, bId: string, cId: string, dId: string;
  let eId: string, fId: string;
  let idsAutreEntreprise: string[] = [];

  beforeAll(async () => {
    const [e] = await db.insert(entreprise).values({ nom: "TEST Portee Equipe", secteurProfil: "agence" }).returning({ id: entreprise.id });
    entrepriseId = e.id;
    const [autre] = await db.insert(entreprise).values({ nom: "TEST Portee Equipe Autre", secteurProfil: "cabinet" }).returning({ id: entreprise.id });
    autreEntrepriseId = autre.id;

    // A gère B gère C gère D (hiérarchie à 4 niveaux).
    const [a] = await db.insert(utilisateur).values({ entrepriseId, email: "a-portee-equipe@vertexone.test", nomComplet: "A", role: "MANAGER" }).returning({ id: utilisateur.id });
    aId = a.id;
    const [b] = await db.insert(utilisateur).values({ entrepriseId, email: "b-portee-equipe@vertexone.test", nomComplet: "B", role: "MANAGER", managerId: aId }).returning({ id: utilisateur.id });
    bId = b.id;
    const [c] = await db.insert(utilisateur).values({ entrepriseId, email: "c-portee-equipe@vertexone.test", nomComplet: "C", role: "EMPLOYE", managerId: bId }).returning({ id: utilisateur.id });
    cId = c.id;
    const [d] = await db.insert(utilisateur).values({ entrepriseId, email: "d-portee-equipe@vertexone.test", nomComplet: "D", role: "EMPLOYE", managerId: cId }).returning({ id: utilisateur.id });
    dId = d.id;

    // E et F se gèrent mutuellement (chaîne corrompue) — ne doit jamais boucler.
    const [eu] = await db.insert(utilisateur).values({ entrepriseId, email: "e-portee-equipe@vertexone.test", nomComplet: "E", role: "MANAGER" }).returning({ id: utilisateur.id });
    eId = eu.id;
    const [f] = await db.insert(utilisateur).values({ entrepriseId, email: "f-portee-equipe@vertexone.test", nomComplet: "F", role: "EMPLOYE", managerId: eId }).returning({ id: utilisateur.id });
    fId = f.id;
    await db.update(utilisateur).set({ managerId: fId }).where(eq(utilisateur.id, eId));

    // Même structure hiérarchique dans une AUTRE entreprise, pour prouver
    // qu'elle n'est jamais mélangée à la première (isolation RLS).
    const [a2] = await db.insert(utilisateur).values({ entrepriseId: autreEntrepriseId, email: "a2-portee-equipe@vertexone.test", nomComplet: "A2", role: "MANAGER" }).returning({ id: utilisateur.id });
    const [b2] = await db
      .insert(utilisateur)
      .values({ entrepriseId: autreEntrepriseId, email: "b2-portee-equipe@vertexone.test", nomComplet: "B2", role: "EMPLOYE", managerId: a2.id })
      .returning({ id: utilisateur.id });
    idsAutreEntreprise = [a2.id, b2.id];
  }, 30_000);

  afterAll(async () => {
    await db.delete(utilisateur).where(eq(utilisateur.entrepriseId, entrepriseId));
    await db.delete(utilisateur).where(eq(utilisateur.entrepriseId, autreEntrepriseId));
    await db.delete(entreprise).where(eq(entreprise.id, entrepriseId));
    await db.delete(entreprise).where(eq(entreprise.id, autreEntrepriseId));
  });

  test("A voit toute son équipe étendue (B, C et D), pas seulement B", async () => {
    const connecteA: UtilisateurConnecte = { utilisateurId: aId, entrepriseId, role: "MANAGER" };
    const visibles = await avecEntreprise(entrepriseId, (tx) => idsVisibles(tx, connecteA, "RH"));
    expect(visibles).not.toBe("TOUT");
    expect(new Set(visibles as string[])).toEqual(new Set([aId, bId, cId, dId]));
  });

  test("B ne voit que lui-même, C et D (pas A, son propre manager)", async () => {
    const connecteB: UtilisateurConnecte = { utilisateurId: bId, entrepriseId, role: "MANAGER" };
    const visibles = await avecEntreprise(entrepriseId, (tx) => idsVisibles(tx, connecteB, "RH"));
    expect(new Set(visibles as string[])).toEqual(new Set([bId, cId, dId]));
  });

  test("une chaîne de management corrompue (E gère F, F gère E) ne boucle jamais indéfiniment", async () => {
    const connecteE: UtilisateurConnecte = { utilisateurId: eId, entrepriseId, role: "MANAGER" };
    const visibles = await avecEntreprise(entrepriseId, (tx) => idsVisibles(tx, connecteE, "RH"));
    expect(new Set(visibles as string[])).toEqual(new Set([eId, fId]));
  }, 10_000);

  test("l'équipe étendue d'une autre entreprise n'apparaît jamais, même avec une hiérarchie identique", async () => {
    const connecteA: UtilisateurConnecte = { utilisateurId: aId, entrepriseId, role: "MANAGER" };
    const visibles = await avecEntreprise(entrepriseId, (tx) => idsVisibles(tx, connecteA, "RH"));
    for (const idAutre of idsAutreEntreprise) {
      expect(visibles).not.toContain(idAutre);
    }
  });
});
