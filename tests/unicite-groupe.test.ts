import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { dossierRH, entreprise, groupe, stagiaireAcademique, utilisateur } from "@/db/schema";
import { chiffresTelephone, dejaEmployeDansLeGroupe, memePersonne, nomComparable } from "@/lib/rh/unicite-groupe";
import { supprimerEntrepriseDeTest } from "./aide-nettoyage";

/** Une même personne ne travaille que dans une entreprise d'un même groupe : reconnue par email, téléphone, ou nom + date de naissance. */
describe("Unicité dans le groupe — règles pures", () => {
  test("téléphone : 9 derniers chiffres, avec ou sans +237, espaces et points ignorés", () => {
    expect(chiffresTelephone("+237 690 11 12 22")).toBe("690111222");
    expect(chiffresTelephone("690.11.12.22")).toBe("690111222");
    expect(chiffresTelephone("12345")).toBeNull();
    expect(chiffresTelephone(null)).toBeNull();
  });

  test("nom comparable : sans accents ni casse, mots dans n'importe quel ordre, jamais un mot seul", () => {
    expect(nomComparable("Jean-Paul  MBARGA")).toBe(nomComparable("mbarga jean paul"));
    expect(nomComparable("Éric Nkoulou")).toBe("eric nkoulou");
    expect(nomComparable("Eric")).toBeNull();
    expect(nomComparable("")).toBeNull();
  });

  test("même personne : email, téléphone, ou nom + date de naissance ; un nom seul ne suffit jamais", () => {
    expect(memePersonne({ email: "A@x.cm" }, { email: "a@X.cm" })).toBe(true);
    expect(memePersonne({ telephone: "+237690111222" }, { telephone: "690 111 222" })).toBe(true);
    expect(memePersonne({ nom: "Jean Mbarga", dateNaissance: "1990-01-02" }, { nom: "MBARGA jean", dateNaissance: "1990-01-02" })).toBe(true);
    expect(memePersonne({ nom: "Jean Mbarga", dateNaissance: "1990-01-02" }, { nom: "Jean Mbarga", dateNaissance: "1991-01-02" })).toBe(false);
    expect(memePersonne({ nom: "Jean Mbarga" }, { nom: "Jean Mbarga" })).toBe(false);
    expect(memePersonne({ telephone: "690111222" }, { telephone: "690111223" })).toBe(false);
  });
});

describe("Unicité dans le groupe — base réelle", () => {
  const suffixe = Math.random().toString(36).slice(2, 8);
  const noms = { A: `TEST Unic A ${suffixe}`, B: `TEST Unic B ${suffixe}`, C: `TEST Unic C ${suffixe}`, D: `TEST Unic D ${suffixe}` };
  const ent: Record<string, string> = {};
  const idPersonne: Record<string, string> = {};

  beforeAll(async () => {
    const [g1] = await db.insert(groupe).values({ nom: `Groupe unic ${suffixe}` }).returning({ id: groupe.id });
    const [g2] = await db.insert(groupe).values({ nom: `Autre groupe unic ${suffixe}` }).returning({ id: groupe.id });
    const creer = async (cle: keyof typeof noms, groupeId: string | null) => {
      const [e] = await db.insert(entreprise).values({ nom: noms[cle], secteurProfil: "agence", groupeId }).returning({ id: entreprise.id });
      ent[cle] = e.id;
    };
    await creer("A", g1.id); // entreprise qui embauche
    await creer("B", g1.id); // même groupe : emploie déjà la personne
    await creer("C", g2.id); // autre groupe : jamais concernée
    await creer("D", null); // aucun groupe
    // Dans B : un collaborateur actif, un collaborateur parti, un stagiaire académique en cours, un client du portail.
    const personne = async (cle: string, statut: "ACTIF" | "SUPPRIME", role: "EMPLOYE" | "CLIENT", nom: string, telephone: string, naissance: string) => {
      const [x] = await db.insert(utilisateur).values({ entrepriseId: ent.B, email: `unic-${cle}-${suffixe}@vertexone.test`, nomComplet: nom, role, statut }).returning({ id: utilisateur.id });
      idPersonne[cle] = x.id;
      if (role !== "CLIENT") await avecEntreprise(ent.B, (tx) => tx.insert(dossierRH).values({ entrepriseId: ent.B, utilisateurId: x.id, poste: "Poste", typeContrat: "CDI", dateEmbauche: new Date("2024-03-01"), telephone, dateNaissance: naissance }));
    };
    await personne("actif", "ACTIF", "EMPLOYE", "Aline Ngono", "+237 677 00 11 22", "1993-05-17");
    await personne("parti", "SUPPRIME", "EMPLOYE", "Brice Etoga", "655 44 33 22", "1988-09-09");
    await personne("client", "ACTIF", "CLIENT", "Carine Client", "699 00 00 01", "1990-01-01");
    await avecEntreprise(ent.B, (tx) =>
      tx.insert(stagiaireAcademique).values({ entrepriseId: ent.B, nom: "Denis Stagiaire", telephone: "671 22 33 44", etablissement: "Université", mission: "Mission", dateDebut: new Date("2026-09-01"), dateFin: new Date("2026-12-31"), statut: "EN_COURS", creeParId: idPersonne.actif } as typeof stagiaireAcademique.$inferInsert)
    );
  }, 180_000);

  afterAll(async () => {
    for (const n of Object.values(noms)) await supprimerEntrepriseDeTest(n);
    await db.delete(groupe).where(eq(groupe.nom, `Groupe unic ${suffixe}`));
    await db.delete(groupe).where(eq(groupe.nom, `Autre groupe unic ${suffixe}`));
  }, 240_000);

  test("refusé : même téléphone, même nom + date de naissance, même email qu'un collaborateur actif d'une autre entreprise du groupe", async () => {
    expect(await dejaEmployeDansLeGroupe(ent.A, { nom: "Autre Nom", telephone: "0677001122" })).toBe(true);
    expect(await dejaEmployeDansLeGroupe(ent.A, { nom: "NGONO aline", dateNaissance: "1993-05-17" })).toBe(true);
    expect(await dejaEmployeDansLeGroupe(ent.A, { email: `UNIC-actif-${suffixe}@vertexone.test` })).toBe(true);
  }, 90_000);

  test("refusé aussi pour un stagiaire académique en cours du groupe", async () => {
    expect(await dejaEmployeDansLeGroupe(ent.A, { telephone: "+237671223344" })).toBe(true);
  }, 60_000);

  test("accepté : personne différente, un nom seul, collaborateur parti, client du portail", async () => {
    expect(await dejaEmployeDansLeGroupe(ent.A, { nom: "Aline Ngono", dateNaissance: "1990-01-01" })).toBe(false);
    expect(await dejaEmployeDansLeGroupe(ent.A, { nom: "Aline Ngono" })).toBe(false);
    expect(await dejaEmployeDansLeGroupe(ent.A, { telephone: "655433322" })).toBe(false); // parti
    expect(await dejaEmployeDansLeGroupe(ent.A, { telephone: "699000001" })).toBe(false); // client du portail
    expect(await dejaEmployeDansLeGroupe(ent.A, {})).toBe(false);
  }, 90_000);

  test("sans groupe ou dans un autre groupe : jamais bloqué ; la même entreprise ne se bloque pas elle-même", async () => {
    expect(await dejaEmployeDansLeGroupe(ent.D, { telephone: "677001122" })).toBe(false);
    expect(await dejaEmployeDansLeGroupe(ent.C, { telephone: "677001122" })).toBe(false);
    expect(await dejaEmployeDansLeGroupe(ent.B, { telephone: "677001122" })).toBe(false);
  }, 90_000);
});
