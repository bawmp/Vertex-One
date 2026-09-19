import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, utilisateur, posteOuvert, candidature, invitation } from "@/db/schema";
import { validerCv, TAILLE_MAX_CV_OCTETS } from "@/lib/recrutement/validation";
import { convertirCandidatureEnInvitation } from "@/lib/recrutement/conversion";

const PDF = Buffer.from("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n");
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const DOCX = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from("....word/document.xml....")]);
const XLSX = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from("....xl/workbook.xml....")]);
const HTML = Buffer.from("<html><script>alert(1)</script></html>");

// Le type MIME et le nom envoyés par le navigateur sont volontairement
// mensongers dans ces tests : seul le contenu réel compte.
function fichier(contenu: Buffer | Uint8Array, nom = "cv.pdf", type = "application/pdf"): File {
  return new File([contenu as BlobPart], nom, { type });
}

describe("Recrutement — validation du CV par son contenu réel (fonction pure)", () => {
  test("fichier vide : refusé", async () => {
    expect((await validerCv(fichier(Buffer.alloc(0)))).ok).toBe(false);
  });

  test("fichier trop volumineux : refusé", async () => {
    expect((await validerCv(fichier(Buffer.alloc(TAILLE_MAX_CV_OCTETS + 1, 0x20)))).ok).toBe(false);
  });

  test("un vrai PDF est accepté", async () => {
    expect((await validerCv(fichier(PDF))).ok).toBe(true);
  });

  test("un vrai DOCX est accepté, même avec un type MIME vide", async () => {
    expect((await validerCv(fichier(DOCX, "cv.docx", ""))).ok).toBe(true);
  });

  test("une image déclarée comme PDF est refusée", async () => {
    expect((await validerCv(fichier(PNG, "cv.pdf", "application/pdf"))).ok).toBe(false);
  });

  test("du HTML déguisé en PDF est refusé", async () => {
    expect((await validerCv(fichier(HTML, "cv.pdf", "application/pdf"))).ok).toBe(false);
  });

  test("un classeur Excel n'est pas un CV", async () => {
    expect((await validerCv(fichier(XLSX, "cv.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"))).ok).toBe(false);
  });

  test("un PDF sans type MIME déclaré reste accepté (seul le contenu compte)", async () => {
    expect((await validerCv(fichier(PDF, "cv", ""))).ok).toBe(true);
  });
});

describe("Recrutement — conversion en employé (base réelle)", () => {
  let entrepriseId: string;
  let adminId: string;
  let posteId: string;
  let candidatureId: string;
  let candidatureSansEmailId: string;

  beforeAll(async () => {
    const [e] = await db.insert(entreprise).values({ nom: "TEST Recrutement Logique", secteurProfil: "agence" }).returning({ id: entreprise.id });
    entrepriseId = e.id;
    const [admin] = await db.insert(utilisateur).values({ entrepriseId, email: "admin-recrutement-logique@vertexone.test", nomComplet: "Admin", role: "ADMIN" }).returning({ id: utilisateur.id });
    adminId = admin.id;

    await avecEntreprise(entrepriseId, async (tx) => {
      const [p] = await tx.insert(posteOuvert).values({ entrepriseId, titre: "Développeur", creeParId: adminId }).returning({ id: posteOuvert.id });
      posteId = p.id;

      const [c] = await tx
        .insert(candidature)
        .values({ entrepriseId, posteId, nom: "Candidat Test", telephone: "699000000", email: "candidat@vertexone.test", cvCleStockage: "x", cvNomFichier: "cv.pdf", cvTypeMime: "application/pdf", cvTailleOctets: 1000 })
        .returning({ id: candidature.id });
      candidatureId = c.id;

      const [c2] = await tx
        .insert(candidature)
        .values({ entrepriseId, posteId, nom: "Candidat Sans Email", telephone: "699111111", cvCleStockage: "x", cvNomFichier: "cv.pdf", cvTypeMime: "application/pdf", cvTailleOctets: 1000 })
        .returning({ id: candidature.id });
      candidatureSansEmailId = c2.id;
    });
  }, 30_000);

  afterAll(async () => {
    await avecEntreprise(entrepriseId, async (tx) => {
      await tx.delete(candidature).where(eq(candidature.entrepriseId, entrepriseId));
      await tx.delete(invitation).where(eq(invitation.entrepriseId, entrepriseId));
      await tx.delete(posteOuvert).where(eq(posteOuvert.entrepriseId, entrepriseId));
    });
    await db.delete(utilisateur).where(eq(utilisateur.id, adminId));
    await db.delete(entreprise).where(eq(entreprise.id, entrepriseId));
  }, 30_000);

  test("crée une invitation cohérente (email, poste, rôle) et marque la candidature EMBAUCHE", async () => {
    const resultat = await avecEntreprise(entrepriseId, (tx) => convertirCandidatureEnInvitation(tx, entrepriseId, candidatureId, "EMPLOYE", "CDI", new Date("2026-04-01")));
    expect(resultat.erreur).toBeUndefined();
    expect(resultat.succes).toMatch(/^Invitation créée/);

    const [laCandidature] = await avecEntreprise(entrepriseId, (tx) => tx.select().from(candidature).where(eq(candidature.id, candidatureId)));
    expect(laCandidature.statut).toBe("EMBAUCHE");
    expect(laCandidature.invitationId).not.toBeNull();

    const [laInvitation] = await avecEntreprise(entrepriseId, (tx) => tx.select().from(invitation).where(eq(invitation.id, laCandidature.invitationId!)));
    expect(laInvitation.email).toBe("candidat@vertexone.test");
    expect(laInvitation.roleProposee).toBe("EMPLOYE");
    expect(laInvitation.postePropose).toBe("Développeur");
    expect(laInvitation.typeContratPropose).toBe("CDI");
  });

  test("refuse une double conversion", async () => {
    const resultat = await avecEntreprise(entrepriseId, (tx) => convertirCandidatureEnInvitation(tx, entrepriseId, candidatureId, "EMPLOYE", "CDI", new Date("2026-04-01")));
    expect(resultat.erreur).toBe("Cette candidature a déjà été convertie.");
  });

  test("refuse une candidature sans email", async () => {
    const resultat = await avecEntreprise(entrepriseId, (tx) => convertirCandidatureEnInvitation(tx, entrepriseId, candidatureSansEmailId, "EMPLOYE", "CDI", new Date("2026-04-01")));
    expect(resultat.erreur).toMatch(/adresse email/);
  });
});
