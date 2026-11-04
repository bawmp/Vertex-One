import { describe, test, expect, beforeAll, afterAll, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { dossierRH, entreprise, groupe, service, utilisateur } from "@/db/schema";
import { supprimerEntrepriseDeTest } from "./aide-nettoyage";
import type { UtilisateurConnecte } from "@/lib/session";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (u: string) => { throw new Error(`REDIRECT ${u}`); } }));
let connecte: UtilisateurConnecte | null = null;
vi.mock("@/lib/session", () => ({ recupererUtilisateurConnecte: async () => connecte }));

const { anniversairesDesPartenaires, collaborateursDesPartenaires, partenairesFiches, peutVoirPhotoPartenaire } = await import("@/lib/rh/groupe-fiches");
const { definirPartageFichesAction } = await import("@/lib/actions/groupe-fiches");

/** Partage des fiches collaborateur entre les entreprises d'un groupe : deux côtés activés, liste blanche, jamais le salaire. */
describe("Partage des fiches dans un groupe — base réelle", () => {
  const suffixe = Math.random().toString(36).slice(2, 8);
  const noms = { A: `TEST GrpFiche A ${suffixe}`, B: `TEST GrpFiche B ${suffixe}`, C: `TEST GrpFiche C ${suffixe}`, D: `TEST GrpFiche D ${suffixe}`, E: `TEST GrpFiche E ${suffixe}` };
  const ent: Record<string, string> = {};
  const id: Record<string, string> = {};
  const sess = (cle: string, role: "ADMIN" | "MANAGER" | "EMPLOYE", entrepriseId: string) => ({ utilisateurId: id[cle], entrepriseId, role, modulesAutorises: null }) as unknown as UtilisateurConnecte;
  const aujourdhui = "2026-11-04";

  beforeAll(async () => {
    const [g1] = await db.insert(groupe).values({ nom: `Groupe ${suffixe}` }).returning({ id: groupe.id });
    const [g2] = await db.insert(groupe).values({ nom: `Autre groupe ${suffixe}` }).returning({ id: groupe.id });
    const creer = async (cle: keyof typeof noms, groupeId: string | null, partage: boolean) => {
      const [e] = await db.insert(entreprise).values({ nom: noms[cle], secteurProfil: "agence", groupeId, fichesPartageesGroupe: partage }).returning({ id: entreprise.id });
      ent[cle] = e.id;
    };
    await creer("A", g1.id, true);
    await creer("B", g1.id, true);
    await creer("C", g1.id, false); // dans le groupe mais n'a PAS activé le partage
    await creer("D", g2.id, true); // un autre groupe
    await creer("E", null, true); // aucun groupe
    const personne = async (cle: string, e: string, role: "ADMIN" | "MANAGER" | "EMPLOYE", extra: { statut?: "ACTIF" | "SUPPRIME"; naissance?: string | null; serviceId?: string | null } = {}) => {
      const [x] = await db.insert(utilisateur).values({ entrepriseId: ent[e], email: `gf-${cle}-${suffixe}@vertexone.test`, nomComplet: `Personne ${cle}`, role, statut: extra.statut ?? "ACTIF", serviceId: extra.serviceId ?? undefined, photoCleStockage: `${ent[e]}/rh/photos/utilisateurs/${cle}.png`, photoTypeMime: "image/png" }).returning({ id: utilisateur.id });
      id[cle] = x.id;
      await avecEntreprise(ent[e], (tx) => tx.insert(dossierRH).values({ entrepriseId: ent[e], utilisateurId: x.id, poste: `Poste ${cle}`, typeContrat: "CDI", dateEmbauche: new Date("2024-03-01"), salaireBase: 987_654, dateNaissance: extra.naissance ?? null, telephone: `690 00 00 ${cle.length}`, adresse: `Adresse secrète ${cle}`, urgenceNom: `Urgence secrète ${cle}`, urgenceTelephone: "677 99 99 99" }));
    };
    const [sv] = await avecEntreprise(ent.B, (tx) => tx.insert(service).values({ entrepriseId: ent.B, nom: "Comptabilité" }).returning({ id: service.id }));
    await personne("adminA", "A", "ADMIN");
    await personne("managerA", "A", "MANAGER");
    await personne("employeA", "A", "EMPLOYE");
    await personne("adminB", "B", "ADMIN", { naissance: "1990-11-06", serviceId: sv.id });
    await personne("employeB", "B", "EMPLOYE", { naissance: "1996-02-01" });
    await personne("partiB", "B", "EMPLOYE", { statut: "SUPPRIME" });
    await personne("employeC", "C", "EMPLOYE", { naissance: "1991-03-03" });
    await personne("employeD", "D", "EMPLOYE");
    await personne("adminE", "E", "ADMIN");
  }, 180_000);

  afterAll(async () => {
    for (const n of Object.values(noms)) await supprimerEntrepriseDeTest(n);
    await db.delete(groupe).where(eq(groupe.nom, `Groupe ${suffixe}`));
    await db.delete(groupe).where(eq(groupe.nom, `Autre groupe ${suffixe}`));
  }, 240_000);

  test("les partenaires : même groupe ET partage activé des deux côtés", async () => {
    expect((await partenairesFiches(ent.A)).map((p) => p.id)).toEqual([ent.B]); // C n'a pas activé, D est dans un autre groupe
    expect(await partenairesFiches(ent.C)).toEqual([]); // C n'a pas activé : elle ne voit rien non plus
    expect(await partenairesFiches(ent.D)).toEqual([]); // seule dans son groupe
    expect(await partenairesFiches(ent.E)).toEqual([]); // aucun groupe
  }, 120_000);

  test("seule la liste blanche est lue : jamais le salaire, l'adresse, la personne à prévenir", async () => {
    const gens = await collaborateursDesPartenaires(sess("adminA", "ADMIN", ent.A));
    expect(gens.map((g) => g.nom).sort()).toEqual(["Personne adminB", "Personne employeB"]); // pas la personne partie (SUPPRIME), pas C ni D
    expect(Object.keys(gens[0]).sort()).toEqual(["dateEmbauche", "dateNaissance", "departement", "entrepriseId", "entrepriseNom", "nom", "photoCle", "poste", "role", "telephone", "typeContrat", "utilisateurId"]);
    const texte = JSON.stringify(gens);
    expect(texte).not.toContain("987654");
    expect(texte).not.toContain("secrète");
    expect(texte).not.toContain("677 99 99 99");
    const adminB = gens.find((g) => g.nom === "Personne adminB")!;
    expect(adminB).toMatchObject({ poste: "Poste adminB", typeContrat: "CDI", dateNaissance: "1990-11-06", departement: "Comptabilité", entrepriseNom: noms.B });
  }, 120_000);

  test("qui peut voir : l'Administrateur et les Managers, jamais un Employé ; une entreprise sans groupe ne voit rien", async () => {
    expect((await collaborateursDesPartenaires(sess("managerA", "MANAGER", ent.A))).length).toBe(2);
    expect(await collaborateursDesPartenaires(sess("employeA", "EMPLOYE", ent.A))).toEqual([]);
    expect(await collaborateursDesPartenaires(sess("adminE", "ADMIN", ent.E))).toEqual([]);
    expect(await collaborateursDesPartenaires(sess("employeC", "EMPLOYE", ent.C))).toEqual([]);
  }, 120_000);

  test("anniversaires des partenaires, avec le nom de l'entreprise", async () => {
    const a = await anniversairesDesPartenaires(sess("adminA", "ADMIN", ent.A), aujourdhui, 30);
    expect(a.map((x) => `${x.nom}|${x.entrepriseNom}|${x.jours}`)).toEqual([`Personne adminB|${noms.B}|2`]);
  }, 120_000);

  test("photo d'une autre entreprise : seulement un partenaire actif, jamais un autre groupe ni une personne partie", async () => {
    expect(await peutVoirPhotoPartenaire(sess("adminA", "ADMIN", ent.A), id.adminB)).toBe(true);
    expect(await peutVoirPhotoPartenaire(sess("managerA", "MANAGER", ent.A), id.employeB)).toBe(true);
    expect(await peutVoirPhotoPartenaire(sess("employeA", "EMPLOYE", ent.A), id.adminB)).toBe(false);
    expect(await peutVoirPhotoPartenaire(sess("adminA", "ADMIN", ent.A), id.employeC)).toBe(false); // C n'a pas activé
    expect(await peutVoirPhotoPartenaire(sess("adminA", "ADMIN", ent.A), id.employeD)).toBe(false); // autre groupe
    expect(await peutVoirPhotoPartenaire(sess("adminA", "ADMIN", ent.A), id.partiB)).toBe(false); // personne partie
    expect(await peutVoirPhotoPartenaire(sess("adminA", "ADMIN", ent.A), id.managerA)).toBe(false); // son propre collègue : traité par la route habituelle
    expect(await peutVoirPhotoPartenaire(sess("adminE", "ADMIN", ent.E), id.adminB)).toBe(false);
  }, 120_000);

  test("régler le partage : l'Administrateur seul ; couper d'un côté coupe le partage des deux", async () => {
    connecte = sess("employeA", "EMPLOYE", ent.A);
    expect((await definirPartageFichesAction(false)).erreur).toMatch(/Administrateur/);
    connecte = sess("managerA", "MANAGER", ent.A);
    expect((await definirPartageFichesAction(false)).erreur).toMatch(/Administrateur/);
    expect((await db.select({ p: entreprise.fichesPartageesGroupe }).from(entreprise).where(eq(entreprise.id, ent.A)))[0].p).toBe(true);

    // B coupe : A ne voit plus B.
    connecte = sess("adminB", "ADMIN", ent.B);
    expect((await definirPartageFichesAction(false)).erreur).toBeUndefined();
    expect(await partenairesFiches(ent.A)).toEqual([]);
    expect(await collaborateursDesPartenaires(sess("adminA", "ADMIN", ent.A))).toEqual([]);
    expect(await peutVoirPhotoPartenaire(sess("adminA", "ADMIN", ent.A), id.adminB)).toBe(false);

    // C active : A et C se voient (B reste coupée).
    connecte = sess("adminB", "ADMIN", ent.B);
    await definirPartageFichesAction(true);
    await db.update(entreprise).set({ fichesPartageesGroupe: true }).where(eq(entreprise.id, ent.C));
    expect((await partenairesFiches(ent.A)).map((p) => p.id).sort()).toEqual([ent.B, ent.C].sort());
    // Un partenaire ne modifie rien chez l'autre : le salaire de B est intact.
    expect((await avecEntreprise(ent.B, (tx) => tx.select({ s: dossierRH.salaireBase }).from(dossierRH).where(eq(dossierRH.utilisateurId, id.adminB))))[0].s).toBe(987_654);
  }, 180_000);
});
