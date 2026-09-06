import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, utilisateur, contact, dossier, document, demandeSignature, signataire, contrat, ecritureComptable, compteComptable } from "@/db/schema";

/**
 * Test de fuite délibérée entre deux entreprises fictives, pour les quatre
 * tables ajoutées au Palier 4 (demande_signature, signataire, contrat,
 * ecriture_comptable) — voir CLAUDE.md : "après chaque nouveau module
 * touchant à des données d'entreprise, un test délibéré doit vérifier
 * qu'une entreprise fictive ne peut techniquement pas accéder aux données
 * d'une autre."
 *
 * compte_comptable n'est volontairement pas testé ici : référentiel global
 * sans entrepriseId ni RLS (déviation documentée dans src/db/schema.ts).
 */
describe("Palier 4 — isolation RLS entre entreprises (signature/contrats/comptabilité)", () => {
  let kiroId: string;
  let mbargaId: string;
  let utilisateurKiroId: string;
  let utilisateurMbargaId: string;
  let documentMbargaId: string;
  let demandeMbargaId: string;
  let signataireMbargaId: string;
  let jetonMbarga: string;
  let contratMbargaId: string;
  let ecritureMbargaId: string;
  let compteId: string;

  beforeAll(async () => {
    const [kiro] = await db.insert(entreprise).values({ nom: "TEST P4 Agence Kiro", secteurProfil: "agence" }).returning({ id: entreprise.id });
    const [mbarga] = await db.insert(entreprise).values({ nom: "TEST P4 Garage Mbarga", secteurProfil: "artisan" }).returning({ id: entreprise.id });
    kiroId = kiro.id;
    mbargaId = mbarga.id;

    const [uKiro] = await db
      .insert(utilisateur)
      .values({ entrepriseId: kiroId, email: "admin-p4-kiro@vertexone.test", nomComplet: "Admin Kiro", role: "ADMIN" })
      .returning({ id: utilisateur.id });
    const [uMbarga] = await db
      .insert(utilisateur)
      .values({ entrepriseId: mbargaId, email: "admin-p4-mbarga@vertexone.test", nomComplet: "Admin Mbarga", role: "ADMIN" })
      .returning({ id: utilisateur.id });
    utilisateurKiroId = uKiro.id;
    utilisateurMbargaId = uMbarga.id;

    // Référentiel global — une seule ligne suffit pour lier les écritures de test.
    const [compte] = await db
      .insert(compteComptable)
      .values({ numero: "999999", libelle: "TEST Compte transitoire", classe: 9 })
      .onConflictDoNothing({ target: compteComptable.numero })
      .returning({ id: compteComptable.id });
    compteId = compte?.id ?? (await db.select().from(compteComptable).where(eq(compteComptable.numero, "999999")))[0].id;

    const [docM, dS, sM, cM, eM] = await avecEntreprise(mbargaId, async (tx) => {
      const [pr] = await tx
        .insert(contact)
        .values({ entrepriseId: mbargaId, nom: "Client Mbarga", telephone: "+237600000005", assigneAId: utilisateurMbargaId })
        .returning({ id: contact.id });
      const [d] = await tx
        .insert(dossier)
        .values({ entrepriseId: mbargaId, contactId: pr.id, titre: "Dossier Mbarga", responsableId: utilisateurMbargaId })
        .returning({ id: dossier.id });
      const [doc] = await tx
        .insert(document)
        .values({
          entrepriseId: mbargaId,
          dossierId: d.id,
          categorie: "GENERAL",
          nom: "contrat-mbarga.pdf",
          cleStockage: `${mbargaId}/contrat-mbarga.pdf`,
          typeMime: "application/pdf",
          tailleOctets: 2048,
          televerseParId: utilisateurMbargaId,
        })
        .returning({ id: document.id });
      const [demande] = await tx
        .insert(demandeSignature)
        .values({ entrepriseId: mbargaId, documentId: doc.id, empreinteDocument: "abc123", creeParId: utilisateurMbargaId })
        .returning({ id: demandeSignature.id });
      const [sig] = await tx
        .insert(signataire)
        .values({
          entrepriseId: mbargaId,
          demandeSignatureId: demande.id,
          nom: "Client Mbarga",
          telephone: "+237600000005",
          jetonAcces: "jeton-test-mbarga-p4",
        })
        .returning({ id: signataire.id });
      const [c] = await tx
        .insert(contrat)
        .values({ entrepriseId: mbargaId, dossierId: d.id, titre: "Contrat Mbarga", dateDebut: new Date() })
        .returning({ id: contrat.id });
      const [e] = await tx
        .insert(ecritureComptable)
        .values({ entrepriseId: mbargaId, dateEcriture: new Date(), libelle: "Écriture Mbarga", compteId, debit: 1000, credit: 0 })
        .returning({ id: ecritureComptable.id });

      return [doc.id, demande.id, sig.id, c.id, e.id];
    });
    documentMbargaId = docM;
    demandeMbargaId = dS;
    signataireMbargaId = sM;
    jetonMbarga = "jeton-test-mbarga-p4";
    contratMbargaId = cM;
    ecritureMbargaId = eM;
  }, 30_000);

  afterAll(async () => {
    for (const id of [kiroId, mbargaId]) {
      await avecEntreprise(id, async (tx) => {
        await tx.delete(ecritureComptable).where(eq(ecritureComptable.entrepriseId, id));
        await tx.delete(contrat).where(eq(contrat.entrepriseId, id));
        await tx.delete(signataire).where(eq(signataire.entrepriseId, id));
        await tx.delete(demandeSignature).where(eq(demandeSignature.entrepriseId, id));
        await tx.delete(document).where(eq(document.entrepriseId, id));
        await tx.delete(dossier).where(eq(dossier.entrepriseId, id));
        await tx.delete(contact).where(eq(contact.entrepriseId, id));
      });
    }
    await db.delete(compteComptable).where(eq(compteComptable.numero, "999999"));
    await db.delete(utilisateur).where(eq(utilisateur.id, utilisateurKiroId));
    await db.delete(utilisateur).where(eq(utilisateur.id, utilisateurMbargaId));
    await db.delete(entreprise).where(eq(entreprise.id, kiroId));
    await db.delete(entreprise).where(eq(entreprise.id, mbargaId));
  }, 30_000);

  test("une entreprise ne voit pas la demande de signature ni le document d'une autre", async () => {
    const demandes = await avecEntreprise(kiroId, (tx) => tx.select().from(demandeSignature).where(eq(demandeSignature.id, demandeMbargaId)));
    expect(demandes).toHaveLength(0);

    const docs = await avecEntreprise(kiroId, (tx) => tx.select().from(document).where(eq(document.id, documentMbargaId)));
    expect(docs).toHaveLength(0);
  });

  test("une entreprise avec une session active ne peut pas lire, modifier ni supprimer le signataire d'une autre", async () => {
    const lecture = await avecEntreprise(kiroId, (tx) => tx.select().from(signataire).where(eq(signataire.id, signataireMbargaId)));
    expect(lecture).toHaveLength(0);

    await avecEntreprise(kiroId, (tx) => tx.update(signataire).set({ nom: "Piraté" }).where(eq(signataire.id, signataireMbargaId)));
    const [reel] = await avecEntreprise(mbargaId, (tx) => tx.select().from(signataire).where(eq(signataire.id, signataireMbargaId)));
    expect(reel.nom).not.toBe("Piraté");

    await avecEntreprise(kiroId, (tx) => tx.delete(signataire).where(eq(signataire.id, signataireMbargaId)));
    const [toujoursLa] = await avecEntreprise(mbargaId, (tx) => tx.select().from(signataire).where(eq(signataire.id, signataireMbargaId)));
    expect(toujoursLa).toBeDefined();
  });

  test("un signataire reste accessible par son jetonAcces sans session active (accès anonyme légitime)", async () => {
    // Comportement voulu, pas une fuite : c'est le mécanisme qui permet à
    // /signature/[jeton] de fonctionner avant toute connexion (même modèle
    // que "invitation" au Palier 0) — voir la policy "isolation_entreprise_lecture".
    const [viaJeton] = await db.select().from(signataire).where(eq(signataire.jetonAcces, jetonMbarga));
    expect(viaJeton).toBeDefined();
    expect(viaJeton.id).toBe(signataireMbargaId);
  });

  test("une entreprise ne voit pas le contrat ni l'écriture comptable d'une autre", async () => {
    const contrats = await avecEntreprise(kiroId, (tx) => tx.select().from(contrat).where(eq(contrat.id, contratMbargaId)));
    expect(contrats).toHaveLength(0);

    const ecritures = await avecEntreprise(kiroId, (tx) => tx.select().from(ecritureComptable).where(eq(ecritureComptable.id, ecritureMbargaId)));
    expect(ecritures).toHaveLength(0);

    await avecEntreprise(kiroId, (tx) => tx.update(contrat).set({ titre: "Piraté" }).where(eq(contrat.id, contratMbargaId)));
    const [reel] = await avecEntreprise(mbargaId, (tx) => tx.select().from(contrat).where(eq(contrat.id, contratMbargaId)));
    expect(reel.titre).not.toBe("Piraté");
  });
});
