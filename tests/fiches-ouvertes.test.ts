import { describe, test, expect, beforeAll, afterAll, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { dossierRH, entreprise, groupe, stagiaireAcademique, utilisateur } from "@/db/schema";
import { supprimerEntrepriseDeTest } from "./aide-nettoyage";
import type { UtilisateurConnecte } from "@/lib/session";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (u: string) => { throw new Error(`REDIRECT ${u}`); } }));
vi.mock("@/lib/i18n/langue", () => ({ getT: async () => Object.assign((texte: string, v?: Record<string, string | number>) => (v ? texte.replace(/\{(\w+)\}/g, (b, k: string) => String(v[k] ?? b)) : texte), { locale: "fr-FR" }) }));
let connecte: UtilisateurConnecte | null = null;
vi.mock("@/lib/session", () => ({ recupererUtilisateurConnecte: async () => connecte }));

const F = await import("@/lib/rh/fiches-ouvertes");
const { ouvrirFichesAction, modifierFicheOuverteAction } = await import("@/lib/actions/fiche-ouverte");
const { peutVoirPhotoPartenaire } = await import("@/lib/rh/groupe-fiches");

/**
 * Fiches OUVERTES entre entreprises d'un groupe : autorisation partenaire par partenaire (un sens), consultation et modification par liste
 * blanche, jamais le salaire, trace chez le propriétaire. A ouvre à B ; C est dans le groupe sans autorisation ; D est dans un autre groupe.
 */
describe("Fiches ouvertes à une entreprise du groupe — base réelle", () => {
  const suffixe = Math.random().toString(36).slice(2, 8);
  const noms = { A: `TEST FicheOuverte A ${suffixe}`, B: `TEST FicheOuverte B ${suffixe}`, C: `TEST FicheOuverte C ${suffixe}`, D: `TEST FicheOuverte D ${suffixe}` };
  const ent: Record<string, string> = {};
  const id: Record<string, string> = {};
  let stagiaireA = "";
  const sess = (cle: string, role: "ADMIN" | "MANAGER" | "EMPLOYE", e: string, modules: string[] | null = null) => ({ utilisateurId: id[cle], entrepriseId: ent[e], role, modulesAutorises: modules }) as unknown as UtilisateurConnecte;
  const formulaire = (type: "UTILISATEUR" | "STAGIAIRE", ownerCle: string, cibleId: string, champs: Record<string, string>) => {
    const f = new FormData();
    f.set("type", type);
    f.set("entrepriseId", ent[ownerCle]);
    f.set("id", cibleId);
    for (const [k, v] of Object.entries(champs)) f.set(k, v);
    return f;
  };
  const valeursUtilisateur = (extra: Record<string, string> = {}) => ({ poste: "Chef comptable", typeContrat: "CDD", dateFinContrat: "2027-06-30", telephone: "699 11 22 33", adresse: "Bonapriso", urgenceNom: "Marie", urgenceTelephone: "677 00 00 00", dateNaissance: "1990-05-05", ...extra });

  beforeAll(async () => {
    const [g1] = await db.insert(groupe).values({ nom: `Groupe ${suffixe}` }).returning({ id: groupe.id });
    const [g2] = await db.insert(groupe).values({ nom: `Autre groupe ${suffixe}` }).returning({ id: groupe.id });
    const creer = async (cle: keyof typeof noms, groupeId: string) => {
      const [e] = await db.insert(entreprise).values({ nom: noms[cle], secteurProfil: "agence", groupeId }).returning({ id: entreprise.id });
      ent[cle] = e.id;
    };
    await creer("A", g1.id);
    await creer("B", g1.id);
    await creer("C", g1.id);
    await creer("D", g2.id);
    const personne = async (cle: string, e: string, role: "ADMIN" | "MANAGER" | "EMPLOYE") => {
      const [x] = await db.insert(utilisateur).values({ entrepriseId: ent[e], email: `fo-${cle}-${suffixe}@vertexone.test`, nomComplet: `Personne ${cle}`, role, statut: "ACTIF", photoCleStockage: `${ent[e]}/rh/photos/utilisateurs/${cle}.png`, photoTypeMime: "image/png" }).returning({ id: utilisateur.id });
      id[cle] = x.id;
      await avecEntreprise(ent[e], (tx) => tx.insert(dossierRH).values({ entrepriseId: ent[e], utilisateurId: x.id, poste: `Poste ${cle}`, typeContrat: "CDI", dateEmbauche: new Date("2024-03-01"), salaireBase: 987_654, telephone: "690 00 00 00", adresse: `Adresse ${cle}` }));
    };
    await personne("adminA", "A", "ADMIN");
    await personne("employeA", "A", "EMPLOYE");
    await personne("adminB", "B", "ADMIN");
    await personne("managerB", "B", "MANAGER");
    await personne("employeB", "B", "EMPLOYE");
    await personne("adminC", "C", "ADMIN");
    await personne("employeC", "C", "EMPLOYE");
    await personne("adminD", "D", "ADMIN");
    [{ id: stagiaireA }] = await avecEntreprise(ent.A, (tx) => tx.insert(stagiaireAcademique).values({ entrepriseId: ent.A, nom: "Stagiaire Alpha", etablissement: "Université de Douala", dateDebut: new Date("2026-09-01"), dateFin: new Date("2027-02-28"), indemniteMensuelle: 45_000, creeParId: id.adminA }).returning({ id: stagiaireAcademique.id }));
  }, 180_000);

  afterAll(async () => {
    for (const n of Object.values(noms)) await supprimerEntrepriseDeTest(n);
    await db.delete(groupe).where(eq(groupe.nom, `Groupe ${suffixe}`));
    await db.delete(groupe).where(eq(groupe.nom, `Autre groupe ${suffixe}`));
  }, 240_000);

  test("sans autorisation, rien n'est visible ni modifiable, même dans le même groupe", async () => {
    expect(await F.proprietairesOuvertsAMoi(ent.B)).toEqual([]);
    expect(await F.listerFichesOuvertes(sess("adminB", "ADMIN", "B"))).toEqual([]);
    expect(await F.lireFicheOuverte(sess("adminB", "ADMIN", "B"), ent.A, "UTILISATEUR", id.employeA)).toBeNull();
    connecte = sess("adminB", "ADMIN", "B");
    expect(await modifierFicheOuverteAction(null, formulaire("UTILISATEUR", "A", id.employeA, valeursUtilisateur()))).toEqual({ erreur: "Fiche introuvable." });
  }, 90_000);

  test("seul l'Administrateur ouvre ses fiches, et seulement à une entreprise de son groupe", async () => {
    connecte = sess("employeA", "EMPLOYE", "A");
    expect(await ouvrirFichesAction(ent.B, true)).toEqual({ erreur: "Seul l'Administrateur peut ouvrir les fiches à une autre entreprise." });
    connecte = sess("adminA", "ADMIN", "A");
    expect(await ouvrirFichesAction(ent.D, true)).toEqual({ erreur: "Cette entreprise ne fait pas partie de votre groupe." }); // autre groupe
    expect(await ouvrirFichesAction(ent.A, true)).toEqual({ erreur: "Cette entreprise ne fait pas partie de votre groupe." }); // soi-même
    expect(await ouvrirFichesAction(ent.B, true)).toEqual({});
    expect(await F.proprietairesOuvertsAMoi(ent.B)).toEqual([{ id: ent.A, nom: noms.A }]);
  }, 90_000);

  test("l'entreprise autorisée consulte la fiche : liste blanche, jamais le salaire", async () => {
    const liste = await F.listerFichesOuvertes(sess("adminB", "ADMIN", "B"));
    expect(liste).toHaveLength(1);
    expect(liste[0].personnes.map((p) => p.nom).sort()).toEqual(["Personne adminA", "Personne employeA", "Stagiaire Alpha"]);

    const fiche = await F.lireFicheOuverte(sess("managerB", "MANAGER", "B"), ent.A, "UTILISATEUR", id.employeA);
    expect(fiche).toMatchObject({ nom: "Personne employeA", entrepriseNom: noms.A });
    expect(fiche?.valeurs.poste).toBe("Poste employeA");
    // Aucune trace du salaire ni d'un autre champ interdit nulle part dans ce qui est renvoyé.
    expect(JSON.stringify(fiche)).not.toContain("987654");
    expect(JSON.stringify(fiche).toLowerCase()).not.toContain("salaire");

    const stagiaire = await F.lireFicheOuverte(sess("adminB", "ADMIN", "B"), ent.A, "STAGIAIRE", stagiaireA);
    expect(stagiaire?.valeurs.etablissement).toBe("Université de Douala");
    expect(JSON.stringify(stagiaire)).not.toContain("45000");
  }, 90_000);

  test("le sens est unique, un Employé ne voit rien, une autre entreprise du groupe ou d'un autre groupe non plus", async () => {
    // A n'a rien reçu de B.
    expect(await F.lireFicheOuverte(sess("adminA", "ADMIN", "A"), ent.B, "UTILISATEUR", id.employeB)).toBeNull();
    // Un Employé de B : rien.
    expect(await F.lireFicheOuverte(sess("employeB", "EMPLOYE", "B"), ent.A, "UTILISATEUR", id.employeA)).toBeNull();
    // C : dans le groupe, jamais autorisée.
    expect(await F.lireFicheOuverte(sess("adminC", "ADMIN", "C"), ent.A, "UTILISATEUR", id.employeA)).toBeNull();
    // D : un autre groupe, même si l'identifiant de D se retrouvait dans la liste d'A (ancienne donnée) : le groupe est revérifié.
    await db.update(entreprise).set({ fichesOuvertesA: [ent.B, ent.D] }).where(eq(entreprise.id, ent.A));
    expect(await F.lireFicheOuverte(sess("adminD", "ADMIN", "D"), ent.A, "UTILISATEUR", id.employeA)).toBeNull();
    expect(await F.proprietairesOuvertsAMoi(ent.D)).toEqual([]);
    // Une personne d'une AUTRE entreprise lue sous le couvert d'A : introuvable (filtre explicite sur le propriétaire).
    expect(await F.lireFicheOuverte(sess("adminB", "ADMIN", "B"), ent.A, "UTILISATEUR", id.employeC)).toBeNull();
    expect(await F.lireFicheOuverte(sess("adminB", "ADMIN", "B"), ent.A, "UTILISATEUR", id.employeB)).toBeNull();
  }, 90_000);

  test("modification : liste blanche, validation, trace chez le propriétaire, salaire intact", async () => {
    connecte = sess("adminB", "ADMIN", "B");
    const r = await modifierFicheOuverteAction(null, formulaire("UTILISATEUR", "A", id.employeA, valeursUtilisateur({ salaireBase: "1", role: "ADMIN", utilisateurId: id.adminA })));
    expect(r).toEqual({ ok: true });
    const apres = await avecEntreprise(ent.A, async (tx) => {
      const [d] = await tx.select().from(dossierRH).where(eq(dossierRH.utilisateurId, id.employeA));
      const [u] = await tx.select({ role: utilisateur.role }).from(utilisateur).where(eq(utilisateur.id, id.employeA));
      return { d, u, modifs: await F.modificationsRecues(tx, [id.employeA]) };
    });
    expect(apres.d).toMatchObject({ poste: "Chef comptable", typeContrat: "CDD", telephone: "699 11 22 33", adresse: "Bonapriso", dateNaissance: "1990-05-05", salaireBase: 987_654 });
    expect(apres.d.dateFinContrat?.toISOString().slice(0, 10)).toBe("2027-06-30");
    expect(apres.u.role).toBe("EMPLOYE"); // le rôle n'est jamais modifiable
    expect(apres.modifs).toHaveLength(1);
    expect(apres.modifs[0]).toMatchObject({ auteurNom: "Personne adminB", auteurEntrepriseNom: noms.B });
    expect(apres.modifs[0].champs).toContain("Poste");

    // Valeurs invalides : rien n'est écrit.
    expect(await modifierFicheOuverteAction(null, formulaire("UTILISATEUR", "A", id.employeA, valeursUtilisateur({ typeContrat: "INVENTE" })))).toMatchObject({ erreur: "Type de contrat invalide." });
    expect(await modifierFicheOuverteAction(null, formulaire("UTILISATEUR", "A", id.employeA, valeursUtilisateur({ poste: "" })))).toMatchObject({ erreur: "Un champ obligatoire est vide." });
    expect(await modifierFicheOuverteAction(null, formulaire("UTILISATEUR", "A", id.employeA, valeursUtilisateur({ dateNaissance: "2026-02-31" })))).toMatchObject({ erreur: "Une date est invalide." });

    // Stagiaire : même principe, l'indemnité reste intacte.
    expect(await modifierFicheOuverteAction(null, formulaire("STAGIAIRE", "A", stagiaireA, { etablissement: "ENSET Douala", filiere: "Génie civil", mission: "Relevés de chantier", indemniteMensuelle: "999999" }))).toEqual({ ok: true });
    const [s] = await avecEntreprise(ent.A, (tx) => tx.select().from(stagiaireAcademique).where(eq(stagiaireAcademique.id, stagiaireA)));
    expect(s).toMatchObject({ etablissement: "ENSET Douala", filiere: "Génie civil", indemniteMensuelle: 45_000 });
  }, 120_000);

  test("un Manager sans le droit de modifier consulte seulement ; un Employé n'a aucun accès", async () => {
    connecte = sess("managerB", "MANAGER", "B", ["RH"]);
    // Le Manager restreint au module RH garde VOIR ; on lui retire MODIFIER via un rôle sans ce droit.
    const lecteur = sess("employeB", "EMPLOYE", "B");
    connecte = lecteur;
    expect(await modifierFicheOuverteAction(null, formulaire("UTILISATEUR", "A", id.employeA, valeursUtilisateur({ poste: "Pirate" })))).toMatchObject({ erreur: expect.any(String) });
    const [d] = await avecEntreprise(ent.A, (tx) => tx.select({ poste: dossierRH.poste }).from(dossierRH).where(eq(dossierRH.utilisateurId, id.employeA)));
    expect(d.poste).toBe("Chef comptable");
  }, 90_000);

  test("la photo d'une personne d'une entreprise qui a ouvert ses fiches est autorisée, pas celle d'une entreprise fermée", async () => {
    expect(await peutVoirPhotoPartenaire(sess("adminB", "ADMIN", "B"), id.employeA)).toBe(true);
    expect(await peutVoirPhotoPartenaire(sess("adminC", "ADMIN", "C"), id.employeA)).toBe(false);
    expect(await peutVoirPhotoPartenaire(sess("adminA", "ADMIN", "A"), id.employeB)).toBe(false);
  }, 60_000);

  test("fermer l'accès coupe tout aussitôt", async () => {
    connecte = sess("adminA", "ADMIN", "A");
    expect(await ouvrirFichesAction(ent.B, false)).toEqual({});
    expect(await F.listerFichesOuvertes(sess("adminB", "ADMIN", "B"))).toEqual([]);
    expect(await F.lireFicheOuverte(sess("adminB", "ADMIN", "B"), ent.A, "UTILISATEUR", id.employeA)).toBeNull();
    connecte = sess("adminB", "ADMIN", "B");
    expect(await modifierFicheOuverteAction(null, formulaire("UTILISATEUR", "A", id.employeA, valeursUtilisateur({ poste: "Après fermeture" })))).toEqual({ erreur: "Fiche introuvable." });
  }, 90_000);
});
