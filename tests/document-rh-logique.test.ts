import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, utilisateur, dossierRH, documentRH } from "@/db/schema";
import { peutVoirSalaire } from "@/lib/rh/acces";

/**
 * Fichiers RH (échange du 2026-09-08) — vérifie que l'accès reste plus
 * strict que la portée RH normale : un Manager qui a par ailleurs
 * VOIR/MODIFIER sur le dossier RH de son équipe (portée EQUIPE) ne doit PAS
 * pouvoir voir/téléverser les fichiers d'un employé qu'il gère — seuls
 * l'Administrateur et l'intéressé lui-même le peuvent, même garde que le
 * salaire (peutVoirSalaire(), réutilisée telle quelle dans
 * src/lib/actions/document-rh.ts).
 */
describe("Fichiers RH — logique d'accès", () => {
  let entrepriseId: string;
  let adminId: string;
  let managerId: string;
  let employeId: string;
  let dossierId: string;
  let documentId: string;

  beforeAll(async () => {
    const [e] = await db.insert(entreprise).values({ nom: "TEST Document RH Logique", secteurProfil: "agence" }).returning({ id: entreprise.id });
    entrepriseId = e.id;

    const [admin] = await db.insert(utilisateur).values({ entrepriseId, email: "admin-document-rh-logique@vertexone.test", nomComplet: "Admin", role: "ADMIN" }).returning({ id: utilisateur.id });
    const [manager] = await db.insert(utilisateur).values({ entrepriseId, email: "manager-document-rh-logique@vertexone.test", nomComplet: "Manager", role: "MANAGER" }).returning({ id: utilisateur.id });
    const [employe] = await db
      .insert(utilisateur)
      .values({ entrepriseId, email: "employe-document-rh-logique@vertexone.test", nomComplet: "Employé", role: "EMPLOYE", managerId: manager.id })
      .returning({ id: utilisateur.id });
    adminId = admin.id;
    managerId = manager.id;
    employeId = employe.id;

    const resultat = await avecEntreprise(entrepriseId, async (tx) => {
      const [dossier] = await tx
        .insert(dossierRH)
        .values({ entrepriseId, utilisateurId: employeId, poste: "Assistant", typeContrat: "CDI", dateEmbauche: new Date("2022-01-01") })
        .returning({ id: dossierRH.id });
      const [doc] = await tx
        .insert(documentRH)
        .values({ entrepriseId, dossierRHId: dossier.id, nom: "cni.pdf", cleStockage: `${entrepriseId}/cni.pdf`, typeMime: "application/pdf", tailleOctets: 1024, televerseParId: employeId })
        .returning({ id: documentRH.id });
      return { dossierId: dossier.id, documentId: doc.id };
    });
    dossierId = resultat.dossierId;
    documentId = resultat.documentId;
  }, 30_000);

  afterAll(async () => {
    await avecEntreprise(entrepriseId, async (tx) => {
      await tx.delete(documentRH).where(eq(documentRH.entrepriseId, entrepriseId));
      await tx.delete(dossierRH).where(eq(dossierRH.entrepriseId, entrepriseId));
    });
    await db.delete(utilisateur).where(eq(utilisateur.id, adminId));
    await db.delete(utilisateur).where(eq(utilisateur.id, managerId));
    await db.delete(utilisateur).where(eq(utilisateur.id, employeId));
    await db.delete(entreprise).where(eq(entreprise.id, entrepriseId));
  }, 30_000);

  test("l'Administrateur et l'intéressé voient le fichier ; un Manager de son équipe ne le voit pas", () => {
    expect(peutVoirSalaire({ utilisateurId: adminId, entrepriseId, role: "ADMIN" }, employeId)).toBe(true);
    expect(peutVoirSalaire({ utilisateurId: employeId, entrepriseId, role: "EMPLOYE" }, employeId)).toBe(true);
    expect(peutVoirSalaire({ utilisateurId: managerId, entrepriseId, role: "MANAGER" }, employeId)).toBe(false);
  });

  test("les données restent cohérentes en base (dossier et document bien liés)", async () => {
    const [ligne] = await avecEntreprise(entrepriseId, (tx) => tx.select().from(documentRH).where(eq(documentRH.id, documentId)));
    expect(ligne.dossierRHId).toBe(dossierId);
    expect(ligne.televerseParId).toBe(employeId);
  });
});
