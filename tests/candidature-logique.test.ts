import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, utilisateur, posteOuvert, candidature, invitation } from "@/db/schema";
import { cvValide, TAILLE_MAX_CV_OCTETS } from "@/lib/recrutement/validation";
import { convertirCandidatureEnInvitation } from "@/lib/recrutement/conversion";

function fichierFactice(taille: number, type: string): File {
  return new File([new Uint8Array(taille)], "cv.pdf", { type });
}

describe("Recrutement — validation du CV (fonction pure)", () => {
  test("fichier vide : refusé", () => {
    expect(cvValide(fichierFactice(0, "application/pdf"))).not.toBeNull();
  });

  test("fichier trop volumineux : refusé", () => {
    expect(cvValide(fichierFactice(TAILLE_MAX_CV_OCTETS + 1, "application/pdf"))).not.toBeNull();
  });

  test("type MIME non autorisé : refusé", () => {
    expect(cvValide(fichierFactice(1000, "image/png"))).not.toBeNull();
  });

  test("PDF de taille raisonnable : accepté", () => {
    expect(cvValide(fichierFactice(1000, "application/pdf"))).toBeNull();
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
