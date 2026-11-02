import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { db, avecEntreprise } from "@/db/client";
import { compteComptable, ecritureComptable, entreprise, invitation, utilisateur } from "@/db/schema";
import { MATRICE_PERMISSIONS, peut, portee, type Action, type Module } from "@/lib/permissions";
import { modulesRestreignables } from "@/lib/modules-libelles";
import { compterUtilisateursActifs } from "@/lib/abonnement/utilisateurs";
import { calculerBalance } from "@/lib/comptabilite/etats-financiers";
import { supprimerEntrepriseDeTest } from "./aide-nettoyage";

/** Priorité 2.7 : rôle « comptable externe » — lecture seule de la comptabilité, rien d'autre, jamais un collègue ni un utilisateur facturé. */
describe("Comptable externe — matrice de droits (règles pures)", () => {
  const comptable = { role: "COMPTABLE" as const };
  const ACTIONS: Action[] = ["VOIR", "CREER", "MODIFIER", "SUPPRIMER"];
  const modules = Object.keys(MATRICE_PERMISSIONS.COMPTABLE) as Module[];

  test("il peut seulement VOIR la comptabilité, sur toute l'entreprise", () => {
    expect(peut(comptable, "COMPTABILITE", "VOIR")).toBe(true);
    expect(portee(comptable, "COMPTABILITE")).toBe("TOUT");
    for (const a of ["CREER", "MODIFIER", "SUPPRIMER"] as Action[]) expect(peut(comptable, "COMPTABILITE", a)).toBe(false);
  });

  test("aucun droit, quel qu'il soit, sur les 19 autres modules", () => {
    const autres = modules.filter((m) => m !== "COMPTABILITE");
    expect(autres).toHaveLength(19);
    for (const m of autres) for (const a of ACTIONS) expect(peut(comptable, m, a), `${m}/${a}`).toBe(false);
  });

  test("la liste de modules choisie par l'Administrateur ne peut pas lui en donner davantage", () => {
    expect(modulesRestreignables("COMPTABLE")).toEqual(["COMPTABILITE"]);
    expect(peut({ role: "COMPTABLE", modulesAutorises: ["COMPTABILITE", "FACTURATION", "RH"] }, "RH", "VOIR")).toBe(false);
    expect(peut({ role: "COMPTABLE", modulesAutorises: [] }, "COMPTABILITE", "VOIR")).toBe(false); // une restriction ne fait que fermer
  });

  test("les autres rôles ne changent pas : seul l'Administrateur voit la comptabilité", () => {
    for (const role of ["MANAGER", "EMPLOYE", "CLIENT"] as const) expect(peut({ role }, "COMPTABILITE", "VOIR")).toBe(false);
    expect(peut({ role: "ADMIN" }, "COMPTABILITE", "CREER")).toBe(true);
  });
});

describe("Comptable externe — base réelle", () => {
  const suffixe = Math.random().toString(36).slice(2, 8);
  const nomA = `TEST Comptable A ${suffixe}`;
  const nomB = `TEST Comptable B ${suffixe}`;
  let A: string;
  let B: string;

  beforeAll(async () => {
    const [a] = await db.insert(entreprise).values({ nom: nomA, secteurProfil: "agence" }).returning({ id: entreprise.id });
    const [b] = await db.insert(entreprise).values({ nom: nomB, secteurProfil: "agence" }).returning({ id: entreprise.id });
    A = a.id;
    B = b.id;
    await db.insert(utilisateur).values([
      { entrepriseId: A, email: `cpt-admin-${suffixe}@vertexone.test`, nomComplet: "Admin Cpt", role: "ADMIN" },
      { entrepriseId: A, email: `cpt-emp-${suffixe}@vertexone.test`, nomComplet: "Employe Cpt", role: "EMPLOYE" },
      { entrepriseId: A, email: `cpt-client-${suffixe}@vertexone.test`, nomComplet: "Client Cpt", role: "CLIENT" },
      { entrepriseId: A, email: `cpt-expert-${suffixe}@vertexone.test`, nomComplet: "Expert Cpt", role: "COMPTABLE" },
    ]);
    const [compte] = await db.select({ id: compteComptable.id }).from(compteComptable).where((await import("drizzle-orm")).eq(compteComptable.numero, "512000"));
    await avecEntreprise(A, (tx) => tx.insert(ecritureComptable).values({ entrepriseId: A, dateEcriture: new Date("2025-06-01T10:00:00Z"), libelle: "Entrée de test", compteId: compte.id, debit: 12345, credit: 0 }));
  }, 60_000);

  afterAll(async () => {
    await supprimerEntrepriseDeTest(nomA);
    await supprimerEntrepriseDeTest(nomB);
  }, 240_000);

  test("un compte COMPTABLE existe en base, et une invitation peut le proposer", async () => {
    const [expert] = await db.select({ role: utilisateur.role }).from(utilisateur).where((await import("drizzle-orm")).eq(utilisateur.email, `cpt-expert-${suffixe}@vertexone.test`));
    expect(expert.role).toBe("COMPTABLE");
    await avecEntreprise(A, (tx) => tx.insert(invitation).values({ entrepriseId: A, email: `cpt-inv-${suffixe}@vertexone.test`, roleProposee: "COMPTABLE", jeton: `jeton-cpt-${suffixe}`, expireLe: new Date(Date.now() + 3_600_000) }));
  }, 60_000);

  test("il ne compte pas parmi les utilisateurs facturés (ni le client du portail)", async () => {
    // Administrateur + Employé seulement.
    expect(await compterUtilisateursActifs(db, A)).toBe(2);
  }, 60_000);

  test("fuite entre entreprises : ce qu'un comptable voit de A, l'entreprise B ne le voit pas", async () => {
    const fin = new Date("2025-12-31T23:00:00Z");
    const vuParA = await avecEntreprise(A, (tx) => calculerBalance(tx, A, fin));
    expect(vuParA.find((l) => l.numero === "512000")?.solde).toBe(12345);
    const vuParB = await avecEntreprise(B, (tx) => calculerBalance(tx, B, fin));
    expect(vuParB.filter((l) => l.solde !== 0)).toEqual([]);
  }, 60_000);
});
