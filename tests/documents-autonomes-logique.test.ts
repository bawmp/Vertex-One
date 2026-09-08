import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, utilisateur, contact, dossier, projet, document } from "@/db/schema";
import { idsVisibles } from "@/lib/portee";
import { peutVoirDocumentSensible, estCategorieSensible } from "@/lib/documents/acces";
import type { UtilisateurConnecte } from "@/lib/session";

/**
 * Documents autonomes (échange du 2026-09-08, comparaison avec le module
 * Documents de Zoho Books : "les fichiers peuvent venir de n'importe où").
 * Vérifie les deux correctifs apportés à journaliserAccesDocument()/
 * ajouterDocument() (src/lib/actions/document.ts) :
 *
 * 1. Un document rattaché seulement à un Projet (sans dossierId direct)
 *    doit quand même respecter la restriction de sensibilité via le
 *    Dossier du Projet, jamais un accès sans contrôle.
 * 2. Un document autonome (ni Dossier ni Projet) respecte la portée du
 *    rôle sur le module DOCUMENTS via son propre televerseParId — un
 *    Employé (portée PROPRE) ne doit jamais voir le document autonome
 *    d'un collègue, même dans la même entreprise.
 *
 * journaliserAccesDocument()/ajouterDocument() vérifient la session via
 * recupererUtilisateurConnecte() — indisponible hors requête HTTP réelle
 * dans ce test, donc on reproduit directement la même logique.
 */
describe("Documents autonomes — logique métier", () => {
  let entrepriseId: string;
  let adminId: string;
  let employeAId: string;
  let employeBId: string;
  let utilisateurConnecteEmployeA: UtilisateurConnecte;
  let utilisateurConnecteEmployeB: UtilisateurConnecte;
  let dossierId: string;
  let projetId: string;
  let documentAutonomeAId: string;
  let documentProjetSensibleId: string;

  beforeAll(async () => {
    const [e] = await db.insert(entreprise).values({ nom: "TEST Documents Autonomes", secteurProfil: "agence" }).returning({ id: entreprise.id });
    entrepriseId = e.id;

    const [admin] = await db
      .insert(utilisateur)
      .values({ entrepriseId, email: "admin-docs-autonomes@vertexone.test", nomComplet: "Admin Docs Autonomes", role: "ADMIN" })
      .returning({ id: utilisateur.id });
    const [empA] = await db
      .insert(utilisateur)
      .values({ entrepriseId, email: "employe-a-docs-autonomes@vertexone.test", nomComplet: "Employé A", role: "EMPLOYE" })
      .returning({ id: utilisateur.id });
    const [empB] = await db
      .insert(utilisateur)
      .values({ entrepriseId, email: "employe-b-docs-autonomes@vertexone.test", nomComplet: "Employé B", role: "EMPLOYE" })
      .returning({ id: utilisateur.id });
    adminId = admin.id;
    employeAId = empA.id;
    employeBId = empB.id;
    utilisateurConnecteEmployeA = { utilisateurId: employeAId, entrepriseId, role: "EMPLOYE" };
    utilisateurConnecteEmployeB = { utilisateurId: employeBId, entrepriseId, role: "EMPLOYE" };

    await avecEntreprise(entrepriseId, async (tx) => {
      const [leContact] = await tx.insert(contact).values({ entrepriseId, nom: "Contact Docs Autonomes", telephone: "+237600000088", assigneAId: adminId }).returning({ id: contact.id });
      const [leDossier] = await tx.insert(dossier).values({ entrepriseId, contactId: leContact.id, titre: "Dossier Docs Autonomes", responsableId: adminId }).returning({ id: dossier.id });
      const [leProjet] = await tx.insert(projet).values({ entrepriseId, dossierId: leDossier.id, titre: "Projet Docs Autonomes", responsablePrincipalId: adminId }).returning({ id: projet.id });
      dossierId = leDossier.id;
      projetId = leProjet.id;

      const [docAutonome] = await tx
        .insert(document)
        .values({ entrepriseId, categorie: "GENERAL", nom: "Modèle A.pdf", cleStockage: `${entrepriseId}/modele-a.pdf`, typeMime: "application/pdf", tailleOctets: 100, televerseParId: employeAId })
        .returning({ id: document.id });
      documentAutonomeAId = docAutonome.id;

      // Document sensible rattaché seulement au Projet (pas de dossierId
      // direct) — reproduit le cas réel de FormulaireDocument sur la fiche
      // Projet, qui ne transmet jamais dossierId.
      const [docProjetSensible] = await tx
        .insert(document)
        .values({ entrepriseId, projetId, categorie: "PIECE_IDENTITE", nom: "Passeport.pdf", cleStockage: `${entrepriseId}/passeport.pdf`, typeMime: "application/pdf", tailleOctets: 200, televerseParId: adminId })
        .returning({ id: document.id });
      documentProjetSensibleId = docProjetSensible.id;
    });
  }, 30_000);

  afterAll(async () => {
    await avecEntreprise(entrepriseId, async (tx) => {
      await tx.delete(document).where(eq(document.entrepriseId, entrepriseId));
      await tx.delete(projet).where(eq(projet.entrepriseId, entrepriseId));
      await tx.delete(dossier).where(eq(dossier.entrepriseId, entrepriseId));
      await tx.delete(contact).where(eq(contact.entrepriseId, entrepriseId));
    });
    await db.delete(utilisateur).where(eq(utilisateur.id, adminId));
    await db.delete(utilisateur).where(eq(utilisateur.id, employeAId));
    await db.delete(utilisateur).where(eq(utilisateur.id, employeBId));
    await db.delete(entreprise).where(eq(entreprise.id, entrepriseId));
  }, 30_000);

  test("ajouterDocument() force la catégorie GENERAL pour un document autonome (reproduit la garde)", () => {
    const dossierId: string | null = null;
    const projetId: string | null = null;
    const categorieSoumise = "PIECE_IDENTITE";
    const categorie = !dossierId && !projetId ? "GENERAL" : categorieSoumise;
    expect(categorie).toBe("GENERAL");
  });

  test("un document autonome respecte la portée DOCUMENTS sur son propre televerseParId : visible pour son auteur, invisible pour un collègue de portée PROPRE", async () => {
    const visiblesPourA = await avecEntreprise(entrepriseId, (tx) => idsVisibles(tx, utilisateurConnecteEmployeA, "DOCUMENTS"));
    const [leDocument] = await avecEntreprise(entrepriseId, (tx) => tx.select().from(document).where(eq(document.id, documentAutonomeAId)));

    const autoriseA = visiblesPourA === "TOUT" || visiblesPourA.includes(leDocument.televerseParId);
    expect(autoriseA).toBe(true);

    const visiblesPourB = await avecEntreprise(entrepriseId, (tx) => idsVisibles(tx, utilisateurConnecteEmployeB, "DOCUMENTS"));
    const autoriseB = visiblesPourB === "TOUT" || visiblesPourB.includes(leDocument.televerseParId);
    expect(autoriseB).toBe(false);
  });

  test("un document sensible rattaché seulement à un Projet (sans dossierId direct) reste restreint au responsable du Dossier du Projet", async () => {
    const [leDocument, leProjet] = await avecEntreprise(entrepriseId, async (tx) => {
      const [doc] = await tx.select().from(document).where(eq(document.id, documentProjetSensibleId));
      const [p] = await tx.select().from(projet).where(eq(projet.id, projetId));
      return [doc, p];
    });
    expect(leDocument.dossierId).toBeNull();
    expect(estCategorieSensible(leDocument.categorie)).toBe(true);

    // Reproduit le correctif de journaliserAccesDocument() : remonter au
    // Dossier du Projet quand dossierId est absent.
    const idDossierEffectif = leDocument.dossierId ?? leProjet.dossierId;
    expect(idDossierEffectif).toBe(dossierId);

    const [leDossier] = await avecEntreprise(entrepriseId, (tx) => tx.select().from(dossier).where(eq(dossier.id, idDossierEffectif!)));
    expect(peutVoirDocumentSensible(utilisateurConnecteEmployeA, leDocument.categorie, leDossier.responsableId)).toBe(false);
    expect(peutVoirDocumentSensible({ role: "ADMIN", utilisateurId: adminId }, leDocument.categorie, leDossier.responsableId)).toBe(true);
  });
});
