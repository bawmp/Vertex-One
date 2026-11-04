import { describe, test, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { preparerPhoto, adressePhoto, TAILLE_MAX_PHOTO } = await import("@/lib/rh/photo");

const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000001e221bc330000000049454e44ae426082", "hex");

describe("Photo de la fiche collaborateur — validation", () => {
  test("une vraie image PNG est acceptée", async () => {
    const r = await preparerPhoto(new File([new Uint8Array(PNG)], "moi.png", { type: "image/png" }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.photo.mime).toBe("image/png");
  });

  test("le type est reconnu sur les octets : un SVG ou un faux .png sont refusés", async () => {
    const svg = new File(['<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'], "x.png", { type: "image/png" });
    expect((await preparerPhoto(svg)).ok).toBe(false);
    expect((await preparerPhoto(new File(["ceci n'est pas une image"], "faux.png", { type: "image/png" }))).ok).toBe(false);
    expect((await preparerPhoto(new File(["<html><body>x</body></html>"], "page.jpg", { type: "image/jpeg" }))).ok).toBe(false);
  });

  test("vide, absent ou trop lourd : refusé avant tout stockage", async () => {
    expect(await preparerPhoto(null)).toMatchObject({ ok: false });
    expect(await preparerPhoto(new File([], "vide.png"))).toMatchObject({ ok: false });
    const lourd = new File([new Uint8Array(TAILLE_MAX_PHOTO + 1)], "gros.png", { type: "image/png" });
    expect(await preparerPhoto(lourd)).toMatchObject({ ok: false, erreur: expect.stringContaining("2 Mo") });
  });

  test("l'adresse de la photo passe toujours par la route contrôlée", () => {
    expect(adressePhoto("utilisateur", "u1", "cle/photo.png")).toBe("/app/rh/photo/utilisateur/u1");
    expect(adressePhoto("stagiaire", "s1", "cle/photo.png")).toBe("/app/rh/photo/stagiaire/s1");
    expect(adressePhoto("utilisateur", "u1", null)).toBeNull();
  });
});

describe("Affichage de la fiche — règles pures", async () => {
  const { ancienneteTexte, tauxTachesTerminees, libelleStatutTache } = await import("@/lib/rh/fiche-affichage");

  test("ancienneté en clair", () => {
    const ref = new Date("2026-11-04T10:00:00Z");
    expect(ancienneteTexte(new Date("2026-11-01T00:00:00Z"), ref)).toBe("Moins d'un mois");
    expect(ancienneteTexte(new Date("2026-06-04T00:00:00Z"), ref)).toBe("5 mois");
    expect(ancienneteTexte(new Date("2026-06-05T00:00:00Z"), ref)).toBe("4 mois");
    expect(ancienneteTexte(new Date("2024-08-01T00:00:00Z"), ref)).toBe("2 ans et 3 mois");
    expect(ancienneteTexte(new Date("2025-11-04T00:00:00Z"), ref)).toBe("1 an");
    expect(ancienneteTexte(new Date("2027-01-01T00:00:00Z"), ref)).toBe("Pas encore arrivé(e)");
  });

  test("avancement des tâches et libellés", () => {
    expect(tauxTachesTerminees(0, 0)).toBeNull();
    expect(tauxTachesTerminees(4, 2)).toBe(33);
    expect(tauxTachesTerminees(0, 5)).toBe(100);
    expect(libelleStatutTache("NON_COMMENCEE")).toBe("À faire");
    expect(libelleStatutTache("EN_COURS")).toBe("En cours");
  });
});

describe("Organigramme — règle pure", async () => {
  const { construireOrganigramme, compterPersonnes } = await import("@/lib/rh/organigramme");
  const p = (id: string, managerId: string | null, nom = id) => ({ id, dossierId: `d-${id}`, nom, role: "EMPLOYE", poste: "Poste", departement: null, managerId, photoCle: null });

  test("arbre à plusieurs niveaux, trié par nom ; un responsable hors liste fait une racine", () => {
    const arbre = construireOrganigramme([p("dg", null, "Zoé"), p("m1", "dg", "Marc"), p("m2", "dg", "Alain"), p("e1", "m1", "Paul"), p("ext", "inconnu", "Bea")]);
    expect(arbre.map((n) => n.nom)).toEqual(["Bea", "Zoé"]);
    const dg = arbre.find((n) => n.id === "dg")!;
    expect(dg.enfants.map((n) => n.nom)).toEqual(["Alain", "Marc"]);
    expect(dg.enfants[1].enfants.map((n) => n.id)).toEqual(["e1"]);
    expect(compterPersonnes(arbre)).toBe(5);
  });

  test("un cycle ne boucle jamais : les personnes prises dedans deviennent des racines", () => {
    const arbre = construireOrganigramme([p("a", "b"), p("b", "a"), p("c", "a")]);
    expect(compterPersonnes(arbre)).toBe(3);
    expect(arbre.map((n) => n.id).sort()).toEqual(["a", "b"]);
    expect(construireOrganigramme([p("solo", "solo")]).map((n) => n.id)).toEqual(["solo"]);
  });
});
