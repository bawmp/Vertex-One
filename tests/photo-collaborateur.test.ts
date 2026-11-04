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
