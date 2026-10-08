import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { eq, and } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, utilisateur, contact, document, demandeSuppressionDocument } from "@/db/schema";
import { estCategorieSensible, estDocumentPriveContact, peutVoirDocumentSensible, peutSupprimerDocument, responsableDuDocument } from "@/lib/documents/acces";
import { demandesSuppressionEnAttente } from "@/lib/documents/demandes";
import { supprimerEntrepriseDeTest } from "./aide-nettoyage";

/**
 * Pièces privées d'un client (One CRM) et demandes de suppression (2026-10-08). Les Server Actions vérifient la
 * session (indisponible hors requête HTTP) : on teste ici les règles pures et la base réelle — RLS comprise —
 * exactement comme le reste du dépôt, voir CLAUDE.md.
 */
describe("Règles d'accès — logique pure", () => {
  const admin = { role: "ADMIN" as const, utilisateurId: "u-admin" };
  const responsable = { role: "MANAGER" as const, utilisateurId: "u-resp" };
  const autre = { role: "MANAGER" as const, utilisateurId: "u-autre" };

  test("Autre sensible est traité comme sensible (comme PIECE_IDENTITE et DONNEES_SANTE)", () => {
    for (const c of ["PIECE_IDENTITE", "DONNEES_SANTE", "AUTRE_SENSIBLE"]) expect(estCategorieSensible(c)).toBe(true);
    expect(estCategorieSensible("GENERAL")).toBe(false);
  });

  test("une pièce privée de contact = sensible + contact + ni dossier ni projet", () => {
    expect(estDocumentPriveContact({ dossierId: null, projetId: null, contactId: "c1", categorie: "PIECE_IDENTITE" })).toBe(true);
    expect(estDocumentPriveContact({ dossierId: null, projetId: null, contactId: "c1", categorie: "GENERAL" })).toBe(false);
    expect(estDocumentPriveContact({ dossierId: "d1", projetId: null, contactId: "c1", categorie: "PIECE_IDENTITE" })).toBe(false);
    expect(estDocumentPriveContact({ dossierId: null, projetId: null, contactId: null, categorie: "PIECE_IDENTITE" })).toBe(false);
  });

  test("seuls l'administrateur et le responsable du contact voient une pièce privée", () => {
    const responsableId = responsableDuDocument({ responsableDossierId: null, responsableContactId: responsable.utilisateurId });
    expect(peutVoirDocumentSensible(admin, "PIECE_IDENTITE", responsableId)).toBe(true);
    expect(peutVoirDocumentSensible(responsable, "PIECE_IDENTITE", responsableId)).toBe(true);
    expect(peutVoirDocumentSensible(autre, "PIECE_IDENTITE", responsableId)).toBe(false);
    expect(peutVoirDocumentSensible(autre, "GENERAL", responsableId)).toBe(true);
  });

  test("le responsable du Dossier prime sur celui du contact", () => {
    expect(responsableDuDocument({ responsableDossierId: "resp-dossier", responsableContactId: "resp-contact" })).toBe("resp-dossier");
    expect(responsableDuDocument({ responsableDossierId: null, responsableContactId: "resp-contact" })).toBe("resp-contact");
    expect(responsableDuDocument({ responsableDossierId: null, responsableContactId: null })).toBeNull();
  });

  test("suppression directe : l'administrateur ou l'auteur du téléversement, personne d'autre", () => {
    expect(peutSupprimerDocument("u-admin", "u-quelquun", true)).toBe(true);
    expect(peutSupprimerDocument("u-auteur", "u-auteur", false)).toBe(true);
    expect(peutSupprimerDocument("u-autre", "u-auteur", false)).toBe(false);
  });
});

describe("Demandes de suppression de document — base réelle", () => {
  const suffixe = Math.random().toString(36).slice(2, 8);
  const nomA = `TEST SuppressionDoc A ${suffixe}`;
  const nomB = `TEST SuppressionDoc B ${suffixe}`;
  let entrepriseA: string;
  let entrepriseB: string;
  let adminId: string;
  let demandeurId: string;
  let contactId: string;
  let docPriveId: string;
  let docGeneralId: string;

  beforeAll(async () => {
    const [a] = await db.insert(entreprise).values({ nom: nomA, secteurProfil: "agence" }).returning({ id: entreprise.id });
    const [b] = await db.insert(entreprise).values({ nom: nomB, secteurProfil: "agence" }).returning({ id: entreprise.id });
    entrepriseA = a.id;
    entrepriseB = b.id;
    const [ua] = await db.insert(utilisateur).values({ entrepriseId: entrepriseA, email: `admin-supp-${suffixe}@vertexone.test`, nomComplet: "Admin Suppression", role: "ADMIN" }).returning({ id: utilisateur.id });
    const [ud] = await db.insert(utilisateur).values({ entrepriseId: entrepriseA, email: `manager-supp-${suffixe}@vertexone.test`, nomComplet: "Marie Demandeuse", role: "MANAGER" }).returning({ id: utilisateur.id });
    adminId = ua.id;
    demandeurId = ud.id;

    await avecEntreprise(entrepriseA, async (tx) => {
      const [c] = await tx.insert(contact).values({ entrepriseId: entrepriseA, nom: "Client Privé", telephone: "+237690000001", assigneAId: demandeurId }).returning({ id: contact.id });
      contactId = c.id;
      const base = { entrepriseId: entrepriseA, contactId: c.id, typeMime: "application/pdf", tailleOctets: 10, televerseParId: adminId };
      const [prive] = await tx.insert(document).values({ ...base, categorie: "PIECE_IDENTITE", nom: "passeport.pdf", cleStockage: "k1" }).returning({ id: document.id });
      const [general] = await tx.insert(document).values({ ...base, categorie: "GENERAL", nom: "devis-signe.pdf", cleStockage: "k2" }).returning({ id: document.id });
      docPriveId = prive.id;
      docGeneralId = general.id;
    });
  }, 90_000);

  afterAll(async () => {
    await supprimerEntrepriseDeTest(nomA);
    await supprimerEntrepriseDeTest(nomB);
  }, 90_000);

  test("la liste du module Documents n'affiche jamais une pièce privée de contact, mais garde le document général", async () => {
    const tous = await avecEntreprise(entrepriseA, (tx) => tx.select().from(document).where(eq(document.entrepriseId, entrepriseA)));
    expect(tous).toHaveLength(2);
    const dansOneDocs = tous.filter((d) => !estDocumentPriveContact(d));
    expect(dansOneDocs.map((d) => d.id)).toEqual([docGeneralId]);
  });

  test("la fiche contact retrouve ses deux documents (la restriction se fait ensuite par responsable)", async () => {
    const duContact = await avecEntreprise(entrepriseA, (tx) => tx.select().from(document).where(eq(document.contactId, contactId)));
    expect(duContact).toHaveLength(2);
  });

  test("une demande de suppression garde qui l'a faite, et une seule demande en attente par document", async () => {
    await avecEntreprise(entrepriseA, (tx) =>
      tx.insert(demandeSuppressionDocument).values({ entrepriseId: entrepriseA, documentId: docGeneralId, documentNom: "devis-signe.pdf", demandeParId: demandeurId, motif: "Doublon" })
    );
    await expect(
      avecEntreprise(entrepriseA, (tx) =>
        tx.insert(demandeSuppressionDocument).values({ entrepriseId: entrepriseA, documentId: docGeneralId, documentNom: "devis-signe.pdf", demandeParId: demandeurId })
      )
    ).rejects.toThrow();

    // Une fois traitée, une nouvelle demande redevient possible.
    await avecEntreprise(entrepriseA, (tx) =>
      tx.update(demandeSuppressionDocument).set({ statut: "REFUSEE", traiteParId: adminId, traiteLe: new Date() }).where(and(eq(demandeSuppressionDocument.documentId, docGeneralId), eq(demandeSuppressionDocument.statut, "EN_ATTENTE")))
    );
    await avecEntreprise(entrepriseA, (tx) =>
      tx.insert(demandeSuppressionDocument).values({ entrepriseId: entrepriseA, documentId: docGeneralId, documentNom: "devis-signe.pdf", demandeParId: demandeurId, motif: "Toujours en doublon" })
    );
  });

  test("l'administrateur voit qui a demandé et pourquoi ; les autres savent seulement qu'une demande existe", async () => {
    const pourAdmin = await avecEntreprise(entrepriseA, (tx) => demandesSuppressionEnAttente(tx, entrepriseA, [docGeneralId, docPriveId], true));
    expect(Object.keys(pourAdmin)).toEqual([docGeneralId]);
    expect(pourAdmin[docGeneralId].demandeParNom).toBe("Marie Demandeuse");
    expect(pourAdmin[docGeneralId].motif).toBe("Toujours en doublon");

    const pourAutres = await avecEntreprise(entrepriseA, (tx) => demandesSuppressionEnAttente(tx, entrepriseA, [docGeneralId], false));
    expect(pourAutres[docGeneralId].demandeParNom).toBe("");
    expect(pourAutres[docGeneralId].motif).toBeNull();
  });

  test("fuite : l'entreprise B ne voit aucune demande de l'entreprise A, ni directement ni via le chargeur", async () => {
    const vuesParB = await avecEntreprise(entrepriseB, (tx) => tx.select().from(demandeSuppressionDocument));
    expect(vuesParB).toHaveLength(0);
    const viaChargeur = await avecEntreprise(entrepriseB, (tx) => demandesSuppressionEnAttente(tx, entrepriseB, [docGeneralId, docPriveId], true));
    expect(viaChargeur).toEqual({});
  });

  test("fuite : l'entreprise B ne peut pas écrire une demande au nom de l'entreprise A", async () => {
    await expect(
      avecEntreprise(entrepriseB, (tx) =>
        tx.insert(demandeSuppressionDocument).values({ entrepriseId: entrepriseA, documentId: docGeneralId, documentNom: "x", demandeParId: demandeurId })
      )
    ).rejects.toThrow();
  });
});
