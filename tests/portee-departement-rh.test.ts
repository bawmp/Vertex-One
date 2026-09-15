import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, utilisateur, service, autorisationDepartementRh } from "@/db/schema";
import { idsVisibles } from "@/lib/portee";
import type { UtilisateurConnecte } from "@/lib/session";

/**
 * Barrière par département en RH (2026-09-15) — voir CLAUDE.md et
 * docs/crm-roadmap-post-commercialisation.md. Portée uniquement RH (jamais
 * CRM/Facturation/Projets...) ; la hiérarchie de management garde toujours
 * priorité (un subordonné reste visible quel que soit son département) ;
 * une autorisation explicite (autorisationDepartementRh) est la seule façon
 * de voir un autre département sans lien hiérarchique.
 */
describe("Portée RH — barrière par département", () => {
  let entrepriseId: string;
  let ventesId: string;
  let supportId: string;
  let managerId: string; // dans Ventes
  let subordonneAutreDeptId: string; // dans Support, mais subordonné direct du manager
  let collegueMemeDeptId: string; // dans Ventes, pas subordonné
  let employeAutreDeptSansAutorisationId: string; // dans Support, ni subordonné ni autorisé

  beforeAll(async () => {
    const [e] = await db.insert(entreprise).values({ nom: "TEST Portee Departement", secteurProfil: "agence" }).returning({ id: entreprise.id });
    entrepriseId = e.id;

    const [ventes] = await avecEntreprise(entrepriseId, (tx) => tx.insert(service).values({ entrepriseId, nom: "Ventes" }).returning({ id: service.id }));
    const [support] = await avecEntreprise(entrepriseId, (tx) => tx.insert(service).values({ entrepriseId, nom: "Support" }).returning({ id: service.id }));
    ventesId = ventes.id;
    supportId = support.id;

    const [manager] = await db
      .insert(utilisateur)
      .values({ entrepriseId, email: "manager-dept@vertexone.test", nomComplet: "Manager Ventes", role: "MANAGER", serviceId: ventesId })
      .returning({ id: utilisateur.id });
    managerId = manager.id;

    const [subordonne] = await db
      .insert(utilisateur)
      .values({ entrepriseId, email: "subordonne-dept@vertexone.test", nomComplet: "Subordonne Support", role: "EMPLOYE", serviceId: supportId, managerId })
      .returning({ id: utilisateur.id });
    subordonneAutreDeptId = subordonne.id;

    const [collegue] = await db
      .insert(utilisateur)
      .values({ entrepriseId, email: "collegue-dept@vertexone.test", nomComplet: "Collegue Ventes", role: "EMPLOYE", serviceId: ventesId })
      .returning({ id: utilisateur.id });
    collegueMemeDeptId = collegue.id;

    const [autre] = await db
      .insert(utilisateur)
      .values({ entrepriseId, email: "autre-dept@vertexone.test", nomComplet: "Employe Support Isole", role: "EMPLOYE", serviceId: supportId })
      .returning({ id: utilisateur.id });
    employeAutreDeptSansAutorisationId = autre.id;
  }, 30_000);

  afterAll(async () => {
    await db.delete(utilisateur).where(eq(utilisateur.entrepriseId, entrepriseId));
    await avecEntreprise(entrepriseId, (tx) => tx.delete(service).where(eq(service.entrepriseId, entrepriseId)));
    await db.delete(entreprise).where(eq(entreprise.id, entrepriseId));
  });

  const connecteManager: () => UtilisateurConnecte = () => ({ utilisateurId: managerId, entrepriseId, role: "MANAGER" });

  test("le subordonné d'un autre département reste visible (hiérarchie prioritaire)", async () => {
    const visibles = await avecEntreprise(entrepriseId, (tx) => idsVisibles(tx, connecteManager(), "RH"));
    expect(visibles).toContain(subordonneAutreDeptId);
  });

  test("un collègue non-subordonné du même département est visible", async () => {
    const visibles = await avecEntreprise(entrepriseId, (tx) => idsVisibles(tx, connecteManager(), "RH"));
    expect(visibles).toContain(collegueMemeDeptId);
  });

  test("un employé d'un autre département, ni subordonné ni autorisé, reste invisible", async () => {
    const visibles = await avecEntreprise(entrepriseId, (tx) => idsVisibles(tx, connecteManager(), "RH"));
    expect(visibles).not.toContain(employeAutreDeptSansAutorisationId);
  });

  test("après une autorisation explicite de l'Admin, le département devient visible", async () => {
    await avecEntreprise(entrepriseId, (tx) => tx.insert(autorisationDepartementRh).values({ entrepriseId, utilisateurId: managerId, serviceId: supportId }));
    const visibles = await avecEntreprise(entrepriseId, (tx) => idsVisibles(tx, connecteManager(), "RH"));
    expect(visibles).toContain(employeAutreDeptSansAutorisationId);
    await avecEntreprise(entrepriseId, (tx) => tx.delete(autorisationDepartementRh).where(eq(autorisationDepartementRh.utilisateurId, managerId)));
  });

  test("le département n'affecte jamais un autre module (ex. CRM) — portée ÉQUIPE toujours pure hiérarchie", async () => {
    const visiblesCRM = await avecEntreprise(entrepriseId, (tx) => idsVisibles(tx, connecteManager(), "CRM"));
    expect(visiblesCRM).toContain(subordonneAutreDeptId); // hiérarchie, inchangée
    expect(visiblesCRM).not.toContain(collegueMemeDeptId); // même département mais pas subordonné : jamais ajouté hors RH
  });
});
