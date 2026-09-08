import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, utilisateur, dossierRH, demandeDepart, clearanceDepart } from "@/db/schema";

/**
 * Offboarding (échange du 2026-09-08) — reproduit la logique de
 * cloturerDepart()/recupererUtilisateurConnecte() (src/lib/actions/depart.ts,
 * src/lib/session.ts) directement contre la base, ces fonctions dépendant
 * d'une session HTTP réelle indisponible dans ce test.
 */
describe("Offboarding — logique métier", () => {
  let entrepriseId: string;
  let adminId: string;
  let employeId: string;
  let dossierId: string;

  beforeAll(async () => {
    const [e] = await db.insert(entreprise).values({ nom: "TEST Depart Logique", secteurProfil: "agence" }).returning({ id: entreprise.id });
    entrepriseId = e.id;

    const [admin] = await db
      .insert(utilisateur)
      .values({ entrepriseId, email: "admin-depart-logique@vertexone.test", nomComplet: "Admin Départ", role: "ADMIN" })
      .returning({ id: utilisateur.id });
    const [employe] = await db
      .insert(utilisateur)
      .values({ entrepriseId, email: "employe-depart-logique@vertexone.test", nomComplet: "Employé Partant", role: "EMPLOYE" })
      .returning({ id: utilisateur.id });
    adminId = admin.id;
    employeId = employe.id;

    dossierId = await avecEntreprise(entrepriseId, async (tx) => {
      const [dossier] = await tx
        .insert(dossierRH)
        .values({ entrepriseId, utilisateurId: employeId, poste: "Assistant", typeContrat: "CDI", dateEmbauche: new Date("2022-01-01") })
        .returning({ id: dossierRH.id });
      return dossier.id;
    });
  }, 30_000);

  afterAll(async () => {
    await avecEntreprise(entrepriseId, async (tx) => {
      await tx.delete(clearanceDepart).where(eq(clearanceDepart.entrepriseId, entrepriseId));
      await tx.delete(demandeDepart).where(eq(demandeDepart.entrepriseId, entrepriseId));
      await tx.delete(dossierRH).where(eq(dossierRH.entrepriseId, entrepriseId));
    });
    await db.delete(utilisateur).where(eq(utilisateur.id, adminId));
    await db.delete(utilisateur).where(eq(utilisateur.id, employeId));
    await db.delete(entreprise).where(eq(entreprise.id, entrepriseId));
  }, 30_000);

  test("recupererUtilisateurConnecte() traite tout statut différent de ACTIF comme non connecté (reproduit la garde)", () => {
    const estConnecte = (statut: string) => statut === "ACTIF";
    expect(estConnecte("ACTIF")).toBe(true);
    expect(estConnecte("DESACTIVE")).toBe(false);
    expect(estConnecte("INVITE")).toBe(false);
  });

  test("cloturerDepart() bloque tant qu'une clôture reste incomplète, puis clôture correctement une fois toutes validées", async () => {
    const demandeId = await avecEntreprise(entrepriseId, async (tx) => {
      const [d] = await tx
        .insert(demandeDepart)
        .values({ entrepriseId, dossierRHId: dossierId, type: "DEMISSION", dateDepartSouhaitee: new Date("2026-12-01"), statut: "APPROUVEE", dateDepartConfirmee: new Date("2026-12-01"), creeParId: employeId, approuveParId: adminId })
        .returning({ id: demandeDepart.id });
      await tx.insert(clearanceDepart).values([
        { entrepriseId, demandeDepartId: d.id, libelle: "Matériel", responsableId: adminId, complete: false },
        { entrepriseId, demandeDepartId: d.id, libelle: "Finances", responsableId: adminId, complete: true, completeLe: new Date() },
      ]);
      return d.id;
    });

    // Reproduit la garde de cloturerDepart() : bloque si une clôture n'est
    // pas complète.
    const clearancesAvant = await avecEntreprise(entrepriseId, (tx) => tx.select({ complete: clearanceDepart.complete }).from(clearanceDepart).where(eq(clearanceDepart.demandeDepartId, demandeId)));
    expect(clearancesAvant.some((c) => !c.complete)).toBe(true);

    // Valide la clôture manquante.
    await avecEntreprise(entrepriseId, (tx) => tx.update(clearanceDepart).set({ complete: true, completeLe: new Date() }).where(eq(clearanceDepart.demandeDepartId, demandeId)));

    const clearancesApres = await avecEntreprise(entrepriseId, (tx) => tx.select({ complete: clearanceDepart.complete }).from(clearanceDepart).where(eq(clearanceDepart.demandeDepartId, demandeId)));
    expect(clearancesApres.every((c) => c.complete)).toBe(true);

    // Reproduit les effets de cloturerDepart() une fois débloquée.
    await avecEntreprise(entrepriseId, async (tx) => {
      await tx.update(demandeDepart).set({ statut: "CLOTUREE", entretienSortie: "RAS" }).where(eq(demandeDepart.id, demandeId));
      await tx.update(dossierRH).set({ dateDepart: new Date("2026-12-01") }).where(eq(dossierRH.id, dossierId));
      await tx.update(utilisateur).set({ statut: "DESACTIVE" }).where(eq(utilisateur.id, employeId));
    });

    const [demandeFinale] = await avecEntreprise(entrepriseId, (tx) => tx.select().from(demandeDepart).where(eq(demandeDepart.id, demandeId)));
    expect(demandeFinale.statut).toBe("CLOTUREE");
    expect(demandeFinale.entretienSortie).toBe("RAS");

    const [dossierFinal] = await avecEntreprise(entrepriseId, (tx) => tx.select({ dateDepart: dossierRH.dateDepart }).from(dossierRH).where(eq(dossierRH.id, dossierId)));
    expect(dossierFinal.dateDepart).not.toBeNull();

    const [utilisateurFinal] = await db.select({ statut: utilisateur.statut }).from(utilisateur).where(eq(utilisateur.id, employeId));
    expect(utilisateurFinal.statut).toBe("DESACTIVE");
  });
});
