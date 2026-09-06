import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, utilisateur, contact, dossier, projet, canal, document, journalAccesDocument, annonce } from "@/db/schema";

/**
 * Test de fuite délibérée entre deux entreprises fictives, pour les quatre
 * tables ajoutées au Palier 3 (canal, document, journal_acces_document,
 * annonce) — voir CLAUDE.md : "après chaque nouveau module touchant à des
 * données d'entreprise, un test délibéré doit vérifier qu'une entreprise
 * fictive ne peut techniquement pas accéder aux données d'une autre."
 */
describe("Palier 3 — isolation RLS entre entreprises (canal/document/journal/annonce)", () => {
  let kiroId: string;
  let mbargaId: string;
  let utilisateurKiroId: string;
  let utilisateurMbargaId: string;
  let dossierMbargaId: string;
  let projetMbargaId: string;
  let canalMbargaId: string;
  let documentMbargaId: string;
  let journalMbargaId: string;
  let annonceMbargaId: string;

  beforeAll(async () => {
    const [kiro] = await db.insert(entreprise).values({ nom: "TEST P3 Agence Kiro", secteurProfil: "agence" }).returning({ id: entreprise.id });
    const [mbarga] = await db.insert(entreprise).values({ nom: "TEST P3 Garage Mbarga", secteurProfil: "artisan" }).returning({ id: entreprise.id });
    kiroId = kiro.id;
    mbargaId = mbarga.id;

    const [uKiro] = await db
      .insert(utilisateur)
      .values({ entrepriseId: kiroId, email: "admin-p3-kiro@vertexone.test", nomComplet: "Admin Kiro", role: "ADMIN" })
      .returning({ id: utilisateur.id });
    const [uMbarga] = await db
      .insert(utilisateur)
      .values({ entrepriseId: mbargaId, email: "admin-p3-mbarga@vertexone.test", nomComplet: "Admin Mbarga", role: "ADMIN" })
      .returning({ id: utilisateur.id });
    utilisateurKiroId = uKiro.id;
    utilisateurMbargaId = uMbarga.id;

    const [dM, pM, cM, docM, jM, aM] = await avecEntreprise(mbargaId, async (tx) => {
      const [pr] = await tx
        .insert(contact)
        .values({ entrepriseId: mbargaId, nom: "Client Mbarga", telephone: "+237600000004", assigneAId: utilisateurMbargaId })
        .returning({ id: contact.id });
      const [d] = await tx
        .insert(dossier)
        .values({ entrepriseId: mbargaId, contactId: pr.id, titre: "Dossier Mbarga", responsableId: utilisateurMbargaId })
        .returning({ id: dossier.id });
      const [p] = await tx
        .insert(projet)
        .values({ entrepriseId: mbargaId, dossierId: d.id, titre: "Projet Mbarga", responsablePrincipalId: utilisateurMbargaId })
        .returning({ id: projet.id });
      const [c] = await tx
        .insert(canal)
        .values({ entrepriseId: mbargaId, nom: "Projet Mbarga", type: "PROJET", projetId: p.id, idFournisseurChat: `${mbargaId}__${p.id}` })
        .returning({ id: canal.id });
      const [doc] = await tx
        .insert(document)
        .values({
          entrepriseId: mbargaId,
          dossierId: d.id,
          categorie: "GENERAL",
          nom: "contrat.pdf",
          cleStockage: `${mbargaId}/contrat.pdf`,
          typeMime: "application/pdf",
          tailleOctets: 1024,
          televerseParId: utilisateurMbargaId,
        })
        .returning({ id: document.id });
      const [j] = await tx
        .insert(journalAccesDocument)
        .values({ entrepriseId: mbargaId, documentId: doc.id, utilisateurId: utilisateurMbargaId, action: "consultation" })
        .returning({ id: journalAccesDocument.id });
      const [a] = await tx
        .insert(annonce)
        .values({ entrepriseId: mbargaId, auteurId: utilisateurMbargaId, contenu: "Annonce Mbarga" })
        .returning({ id: annonce.id });

      return [d.id, p.id, c.id, doc.id, j.id, a.id];
    });
    dossierMbargaId = dM;
    projetMbargaId = pM;
    canalMbargaId = cM;
    documentMbargaId = docM;
    journalMbargaId = jM;
    annonceMbargaId = aM;
  }, 30_000);

  afterAll(async () => {
    for (const id of [kiroId, mbargaId]) {
      await avecEntreprise(id, async (tx) => {
        await tx.delete(journalAccesDocument).where(eq(journalAccesDocument.entrepriseId, id));
        await tx.delete(document).where(eq(document.entrepriseId, id));
        await tx.delete(canal).where(eq(canal.entrepriseId, id));
        await tx.delete(annonce).where(eq(annonce.entrepriseId, id));
        await tx.delete(projet).where(eq(projet.entrepriseId, id));
        await tx.delete(dossier).where(eq(dossier.entrepriseId, id));
        await tx.delete(contact).where(eq(contact.entrepriseId, id));
      });
    }
    await db.delete(utilisateur).where(eq(utilisateur.id, utilisateurKiroId));
    await db.delete(utilisateur).where(eq(utilisateur.id, utilisateurMbargaId));
    await db.delete(entreprise).where(eq(entreprise.id, kiroId));
    await db.delete(entreprise).where(eq(entreprise.id, mbargaId));
  }, 30_000);

  test("une entreprise ne voit pas les canaux d'une autre", async () => {
    const tentative = await avecEntreprise(kiroId, (tx) => tx.select().from(canal).where(eq(canal.id, canalMbargaId)));
    expect(tentative).toHaveLength(0);

    const large = await avecEntreprise(kiroId, (tx) => tx.select().from(canal));
    expect(large.some((c) => c.id === canalMbargaId)).toBe(false);
  });

  test("une entreprise ne peut pas lire, modifier ni supprimer le document d'une autre", async () => {
    const lecture = await avecEntreprise(kiroId, (tx) => tx.select().from(document).where(eq(document.id, documentMbargaId)));
    expect(lecture).toHaveLength(0);

    await avecEntreprise(kiroId, (tx) => tx.update(document).set({ nom: "pirate.pdf" }).where(eq(document.id, documentMbargaId)));
    const [reel] = await avecEntreprise(mbargaId, (tx) => tx.select().from(document).where(eq(document.id, documentMbargaId)));
    expect(reel.nom).not.toBe("pirate.pdf");

    await avecEntreprise(kiroId, (tx) => tx.delete(document).where(eq(document.id, documentMbargaId)));
    const [toujoursLa] = await avecEntreprise(mbargaId, (tx) => tx.select().from(document).where(eq(document.id, documentMbargaId)));
    expect(toujoursLa).toBeDefined();
  });

  test("une entreprise ne voit pas le journal d'accès ni les annonces d'une autre", async () => {
    const journal = await avecEntreprise(kiroId, (tx) => tx.select().from(journalAccesDocument).where(eq(journalAccesDocument.id, journalMbargaId)));
    expect(journal).toHaveLength(0);

    const annonces = await avecEntreprise(kiroId, (tx) => tx.select().from(annonce).where(eq(annonce.id, annonceMbargaId)));
    expect(annonces).toHaveLength(0);
  });
});
