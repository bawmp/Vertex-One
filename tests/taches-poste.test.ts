import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { dossierRH, entreprise, tachePoste, utilisateur } from "@/db/schema";
import { validerTachePoste } from "@/lib/rh/taches-poste-regles";
import { ajouterTachePoste, lireTachesPoste, peutGererTachesPoste, retirerTachePoste } from "@/lib/rh/taches-poste";
import type { UtilisateurConnecte } from "@/lib/session";
import { supprimerEntrepriseDeTest } from "./aide-nettoyage";

/** Tâches du poste : responsabilités posées par l'Administrateur ou le manager de la personne, lisibles sur sa fiche, jamais entre entreprises. */
describe("Tâches du poste — règles pures", () => {
  test("validation : titre de 3 à 120 caractères nettoyé, détail borné, fréquence connue", () => {
    expect(validerTachePoste({ titre: "  Relancer   les factures ", description: " ", frequence: "HEBDOMADAIRE" })).toEqual({ ok: true, valeurs: { titre: "Relancer les factures", description: null, frequence: "HEBDOMADAIRE" } });
    expect(validerTachePoste({ titre: "ab", description: "", frequence: "MENSUELLE" }).ok).toBe(false);
    expect(validerTachePoste({ titre: "x".repeat(121), description: "", frequence: "MENSUELLE" }).ok).toBe(false);
    expect(validerTachePoste({ titre: "Clôturer la caisse", description: "y".repeat(601), frequence: "QUOTIDIENNE" }).ok).toBe(false);
    expect(validerTachePoste({ titre: "Clôturer la caisse", description: "", frequence: "JAMAIS" }).ok).toBe(false);
  });
});

describe("Tâches du poste — base réelle", () => {
  const suffixe = Math.random().toString(36).slice(2, 8);
  const nomA = `TEST TachePoste A ${suffixe}`;
  const nomB = `TEST TachePoste B ${suffixe}`;
  const ent: Record<string, string> = {};
  const id: Record<string, string> = {};
  const sess = (cle: string, role: "ADMIN" | "MANAGER" | "EMPLOYE", e: string) => ({ utilisateurId: id[cle], entrepriseId: ent[e], role, modulesAutorises: null }) as unknown as UtilisateurConnecte;

  beforeAll(async () => {
    for (const [cle, nom] of [["A", nomA], ["B", nomB]] as const) {
      const [e] = await db.insert(entreprise).values({ nom, secteurProfil: "agence" }).returning({ id: entreprise.id });
      ent[cle] = e.id;
    }
    const personne = async (cle: string, e: string, role: "ADMIN" | "MANAGER" | "EMPLOYE", managerId?: string) => {
      const [x] = await db.insert(utilisateur).values({ entrepriseId: ent[e], email: `tp-${cle}-${suffixe}@vertexone.test`, nomComplet: `Personne ${cle}`, role, managerId: managerId ?? null }).returning({ id: utilisateur.id });
      id[cle] = x.id;
      await avecEntreprise(ent[e], (tx) => tx.insert(dossierRH).values({ entrepriseId: ent[e], utilisateurId: x.id, poste: "Poste", typeContrat: "CDI", dateEmbauche: new Date("2024-03-01") }));
    };
    await personne("adminA", "A", "ADMIN");
    await personne("managerA", "A", "MANAGER");
    await personne("autreManagerA", "A", "MANAGER");
    await personne("employeA", "A", "EMPLOYE", id.managerA); // dans l'équipe de managerA
    await personne("collegueA", "A", "EMPLOYE", id.autreManagerA); // dans l'équipe d'un autre manager
    await personne("employeB", "B", "EMPLOYE");
  }, 180_000);

  afterAll(async () => {
    await supprimerEntrepriseDeTest(nomA);
    await supprimerEntrepriseDeTest(nomB);
  }, 240_000);

  const saisie = { titre: "Relancer les factures en retard", description: "Chaque lundi", frequence: "HEBDOMADAIRE" };

  test("l'Administrateur et le manager de la personne en posent ; la fiche les liste dans l'ordre", async () => {
    expect((await avecEntreprise(ent.A, (tx) => ajouterTachePoste(tx, sess("adminA", "ADMIN", "A"), id.employeA, saisie))).ok).toBe(true);
    expect((await avecEntreprise(ent.A, (tx) => ajouterTachePoste(tx, sess("managerA", "MANAGER", "A"), id.employeA, { titre: "Préparer le rapport mensuel", description: "", frequence: "MENSUELLE" }))).ok).toBe(true);
    const liste = await avecEntreprise(ent.A, (tx) => lireTachesPoste(tx, ent.A, id.employeA));
    expect(liste.map((t) => t.titre)).toEqual(["Relancer les factures en retard", "Préparer le rapport mensuel"]);
    expect(liste[0]).toMatchObject({ frequence: "HEBDOMADAIRE", description: "Chaque lundi" });
  }, 120_000);

  test("refusé : la personne elle-même, un manager hors de sa portée, un manager sur sa propre fiche", async () => {
    const refus = async (u: UtilisateurConnecte, cible: string) => (await avecEntreprise(ent.A, (tx) => ajouterTachePoste(tx, u, cible, saisie))).ok;
    expect(await refus(sess("employeA", "EMPLOYE", "A"), id.employeA)).toBe(false);
    expect(await refus(sess("managerA", "MANAGER", "A"), id.collegueA)).toBe(false); // équipe d'un autre manager
    expect(await refus(sess("managerA", "MANAGER", "A"), id.managerA)).toBe(false); // sa propre fiche
    expect((await avecEntreprise(ent.A, (tx) => lireTachesPoste(tx, ent.A, id.collegueA))).length).toBe(0);
  }, 120_000);

  test("retirer : permis à qui gère la personne, refusé aux autres ; une tâche d'une autre entreprise est introuvable", async () => {
    const [t] = await avecEntreprise(ent.A, (tx) => lireTachesPoste(tx, ent.A, id.employeA));
    expect((await avecEntreprise(ent.A, (tx) => retirerTachePoste(tx, sess("employeA", "EMPLOYE", "A"), t.id))).ok).toBe(false);
    expect((await avecEntreprise(ent.A, (tx) => retirerTachePoste(tx, sess("autreManagerA", "MANAGER", "A"), t.id))).ok).toBe(false);
    expect((await avecEntreprise(ent.B, (tx) => retirerTachePoste(tx, sess("employeB", "EMPLOYE", "B"), t.id))).ok).toBe(false);
    expect((await avecEntreprise(ent.A, (tx) => retirerTachePoste(tx, sess("managerA", "MANAGER", "A"), t.id))).ok).toBe(true);
    expect((await avecEntreprise(ent.A, (tx) => lireTachesPoste(tx, ent.A, id.employeA))).length).toBe(1);
  }, 120_000);

  test("fuite : l'autre entreprise ne voit rien, ne peut rien poser sur un collaborateur d'ailleurs, et ses lignes sont invisibles par la base", async () => {
    expect((await avecEntreprise(ent.B, (tx) => lireTachesPoste(tx, ent.B, id.employeA))).length).toBe(0);
    const adminB = { utilisateurId: id.employeB, entrepriseId: ent.B, role: "ADMIN", modulesAutorises: null } as unknown as UtilisateurConnecte;
    expect((await avecEntreprise(ent.B, (tx) => ajouterTachePoste(tx, adminB, id.employeA, saisie))).ok).toBe(false); // cible d'une autre entreprise
    expect(await avecEntreprise(ent.B, (tx) => tx.select({ id: tachePoste.id }).from(tachePoste))).toHaveLength(0);
    expect((await avecEntreprise(ent.A, (tx) => tx.select({ id: tachePoste.id }).from(tachePoste).where(eq(tachePoste.utilisateurId, id.employeA)))).length).toBe(1);
  }, 120_000);

  test("la règle de portée : Administrateur toujours, manager seulement sur son équipe", () => {
    expect(peutGererTachesPoste(sess("adminA", "ADMIN", "A"), "n'importe", [])).toBe(true);
    expect(peutGererTachesPoste(sess("managerA", "MANAGER", "A"), id.employeA, [id.employeA])).toBe(true);
    expect(peutGererTachesPoste(sess("managerA", "MANAGER", "A"), id.collegueA, [id.employeA])).toBe(false);
    expect(peutGererTachesPoste(sess("employeA", "EMPLOYE", "A"), id.employeA, "TOUT")).toBe(false);
  });
});
