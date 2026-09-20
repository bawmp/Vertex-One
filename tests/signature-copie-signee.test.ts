import { describe, test, expect, beforeAll, afterAll, vi } from "vitest";
import { eq } from "drizzle-orm";
import { PDFDocument } from "pdf-lib";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, utilisateur, contact, dossier, document, demandeSignature, signataire } from "@/db/schema";

// Les emails et le stockage sont simulés : on vérifie CE QUI est envoyé et rangé (destinataires,
// pièces jointes, horodatage, dossier), sans dépendre de Resend ni de R2.
type Envoi = { to: string; subject: string; html: string; attachments?: { filename: string; content: Buffer }[] };
const { emailsEnvoyes, stockage } = vi.hoisted(() => ({
  emailsEnvoyes: [] as { to: string; subject: string; html: string; attachments?: { filename: string; content: Buffer }[] }[],
  stockage: { original: Buffer.from("") as Buffer, televerses: [] as { nomFichier: string; contenu: Buffer }[] },
}));
vi.mock("@/lib/email/client", () => ({
  envoyerEmail: vi.fn(async (params: Envoi) => {
    emailsEnvoyes.push(params);
    return { envoye: true };
  }),
}));
vi.mock("@/lib/documents/stockage", () => ({
  lireObjetStockage: vi.fn(async () => stockage.original),
  televerserDocument: vi.fn(async (p: { nomFichier: string; contenu: Buffer }) => {
    stockage.televerses.push({ nomFichier: p.nomFichier, contenu: p.contenu });
    return { cleStockage: `documents-signes/${p.nomFichier}`, televerse: true };
  }),
}));

import { envoyerCopieSignee, notifierRefusSignature } from "@/lib/signature/finalisation";

async function pdfDUnePage(): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  pdf.addPage([595, 842]);
  return Buffer.from(await pdf.save());
}

describe("Signature — document signé rangé dans le dossier et envoyé à l'Administrateur", () => {
  let entrepriseId: string;
  let demandeId: string;
  let dossierId: string;
  const suffixe = Math.random().toString(36).slice(2, 8);
  const emailAdmin = `admin-copie-${suffixe}@vertexone.test`;
  const emailCommercial = `commercial-copie-${suffixe}@vertexone.test`;
  const emailClient = `client-copie-${suffixe}@vertexone.test`;
  const signeLe = new Date("2026-09-20T14:35:12.000Z");

  beforeAll(async () => {
    const [e] = await db.insert(entreprise).values({ nom: "TEST Signature Copie", secteurProfil: "agence" }).returning({ id: entreprise.id });
    entrepriseId = e.id;
    await db.insert(utilisateur).values({ entrepriseId, email: emailAdmin, nomComplet: "Admin Copie", role: "ADMIN" });
    const [commercial] = await db.insert(utilisateur).values({ entrepriseId, email: emailCommercial, nomComplet: "Commercial Copie", role: "EMPLOYE" }).returning({ id: utilisateur.id });

    await avecEntreprise(entrepriseId, async (tx) => {
      const [c] = await tx.insert(contact).values({ entrepriseId, nom: "Jean Client", telephone: "690000000", assigneAId: commercial.id }).returning({ id: contact.id });
      const [d] = await tx.insert(dossier).values({ entrepriseId, contactId: c.id, titre: "Dossier Jean", responsableId: commercial.id }).returning({ id: dossier.id });
      dossierId = d.id;
      const [doc] = await tx
        .insert(document)
        .values({ entrepriseId, dossierId, nom: "Contrat de prestation.pdf", cleStockage: "x", typeMime: "application/pdf", tailleOctets: 10, televerseParId: commercial.id })
        .returning({ id: document.id });
      const [demande] = await tx
        .insert(demandeSignature)
        .values({ entrepriseId, documentId: doc.id, empreinteDocument: "a".repeat(64), creeParId: commercial.id, statut: "SIGNE" })
        .returning({ id: demandeSignature.id });
      demandeId = demande.id;
      await tx.insert(signataire).values({
        entrepriseId,
        demandeSignatureId: demande.id,
        nom: "Jean Client",
        telephone: "690000000",
        email: emailClient,
        statut: "SIGNE",
        signeLe,
        adresseIP: "41.202.1.1",
        navigateurUtilisateur: "Mozilla/5.0 Test",
        consentementExplicite: true,
        jetonAcces: `jeton-copie-${suffixe}`,
      });
    });
  }, 60_000);

  afterAll(async () => {
    await avecEntreprise(entrepriseId, async (tx) => {
      await tx.delete(signataire).where(eq(signataire.entrepriseId, entrepriseId));
      await tx.delete(demandeSignature).where(eq(demandeSignature.entrepriseId, entrepriseId));
      await tx.delete(document).where(eq(document.entrepriseId, entrepriseId));
      await tx.delete(dossier).where(eq(dossier.entrepriseId, entrepriseId));
      await tx.delete(contact).where(eq(contact.entrepriseId, entrepriseId));
    });
    await db.delete(utilisateur).where(eq(utilisateur.entrepriseId, entrepriseId));
    await db.delete(entreprise).where(eq(entreprise.id, entrepriseId));
  }, 60_000);

  test("le contrat signé (contrat + certificat en un PDF) est rangé dans le dossier du client", async () => {
    emailsEnvoyes.length = 0;
    stockage.televerses.length = 0;
    stockage.original = await pdfDUnePage();

    const resultat = await envoyerCopieSignee(entrepriseId, demandeId);
    expect(resultat.archive).toBe(true);

    // Un document « signé » est apparu dans le dossier de Jean, et il contient le contrat + le certificat.
    const documentsDuDossier = await avecEntreprise(entrepriseId, (tx) => tx.select().from(document).where(eq(document.dossierId, dossierId)));
    const signe = documentsDuDossier.find((d) => d.nom.endsWith("signé.pdf"));
    expect(signe).toBeDefined();
    expect(signe!.typeMime).toBe("application/pdf");

    const televerse = stockage.televerses.find((t) => t.nomFichier === signe!.nom)!;
    const pdf = await PDFDocument.load(televerse.contenu);
    expect(pdf.getPageCount()).toBeGreaterThanOrEqual(2); // 1 page de contrat + au moins 1 page de certificat
  }, 60_000);

  test("l'Administrateur et l'auteur reçoivent le document signé et son certificat horodaté", async () => {
    const admin = emailsEnvoyes.find((m) => m.to === emailAdmin);
    const commercial = emailsEnvoyes.find((m) => m.to === emailCommercial);
    expect(admin).toBeDefined();
    expect(commercial).toBeDefined();

    const noms = admin!.attachments!.map((a) => a.filename);
    expect(noms.some((n) => n.endsWith("signé.pdf"))).toBe(true);
    const certificat = admin!.attachments!.find((a) => a.filename.startsWith("Certificat de signature"));
    expect(certificat).toBeDefined();
    expect(certificat!.content.subarray(0, 4).toString()).toBe("%PDF");

    // Horodatage lisible (heure de Yaoundé, UTC+1) et non ambigu (UTC) dans le message.
    expect(admin!.html).toContain("Jean Client");
    expect(admin!.html).toContain("15:35:12"); // 14:35:12 UTC = 15:35:12 à Yaoundé
    expect(admin!.html).toContain("2026-09-20T14:35:12.000Z");
    expect(admin!.html).toContain("rangé dans le dossier du client");
  });

  test("le signataire reçoit aussi sa propre copie", async () => {
    const copie = emailsEnvoyes.find((m) => m.to === emailClient);
    expect(copie).toBeDefined();
    expect(copie!.subject).toContain("Votre copie signée");
    expect(copie!.attachments!.length).toBe(2);
  });

  test("si l'original n'est pas un PDF, on envoie l'original et le certificat séparés, et on range le certificat", async () => {
    emailsEnvoyes.length = 0;
    stockage.televerses.length = 0;
    stockage.original = Buffer.from("PK faux fichier Word");

    const resultat = await envoyerCopieSignee(entrepriseId, demandeId);
    expect(resultat.archive).toBe(true);

    const admin = emailsEnvoyes.find((m) => m.to === emailAdmin)!;
    const noms = admin.attachments!.map((a) => a.filename);
    expect(noms).toContain("Contrat de prestation.pdf");
    expect(noms.some((n) => n.startsWith("Certificat de signature"))).toBe(true);
    expect(stockage.televerses.some((t) => t.nomFichier.startsWith("Certificat de signature"))).toBe(true);
  }, 60_000);

  test("un refus de signature prévient l'Administrateur, avec le motif et la date", async () => {
    emailsEnvoyes.length = 0;
    await notifierRefusSignature(entrepriseId, demandeId, "Jean <b>Client</b>", "Le prix a changé", new Date("2026-09-21T08:00:00.000Z"));
    const admin = emailsEnvoyes.find((m) => m.to === emailAdmin);
    expect(admin).toBeDefined();
    expect(admin!.subject).toContain("Signature refusée");
    expect(admin!.html).toContain("Le prix a changé");
    // Le nom saisi par un tiers est échappé : jamais de HTML brut injecté dans l'email.
    expect(admin!.html).not.toContain("<b>Client</b>");
    expect(admin!.html).toContain("&lt;b&gt;");
  }, 60_000);
});
