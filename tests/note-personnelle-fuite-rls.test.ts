import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, utilisateur, notePersonnelle } from "@/db/schema";

/**
 * Bloc-notes privé de l'Espace personnel Admin (Tranche 4, 2026-09-14) —
 * deux niveaux d'isolation à vérifier, voir CLAUDE.md : "après chaque
 * nouveau module touchant à des données d'entreprise, un test délibéré doit
 * vérifier qu'une entreprise fictive ne peut techniquement pas accéder aux
 * données d'une autre."
 *
 * Mais la RLS (entrepriseId identique) ne protège PAS l'isolation entre deux
 * utilisateurs de la MÊME entreprise — même limite déjà rencontrée pour
 * ticketSupport/messageTicketSupport (voir tests/ticket-support-fuite-rls.test.ts) :
 * c'est le filtre explicite sur utilisateurId (dans
 * src/lib/actions/note-personnelle.ts) qui doit protéger cette frontière-là,
 * jamais la RLS seule.
 */
describe("Note personnelle — isolation RLS entre entreprises + isolation applicative entre utilisateurs", () => {
  let kiroId: string;
  let mbargaId: string;
  let adminKiroId: string;
  let adminMbargaId: string;
  let managerMbargaId: string;
  let noteMbargaAdminId: string;

  beforeAll(async () => {
    const [kiro] = await db.insert(entreprise).values({ nom: "TEST Note Perso Kiro", secteurProfil: "agence" }).returning({ id: entreprise.id });
    const [mbarga] = await db.insert(entreprise).values({ nom: "TEST Note Perso Mbarga", secteurProfil: "artisan" }).returning({ id: entreprise.id });
    kiroId = kiro.id;
    mbargaId = mbarga.id;

    const [uKiro] = await db
      .insert(utilisateur)
      .values({ entrepriseId: kiroId, email: "admin-note-kiro@vertexone.test", nomComplet: "Admin Kiro", role: "ADMIN" })
      .returning({ id: utilisateur.id });
    const [uMbargaAdmin] = await db
      .insert(utilisateur)
      .values({ entrepriseId: mbargaId, email: "admin-note-mbarga@vertexone.test", nomComplet: "Admin Mbarga", role: "ADMIN" })
      .returning({ id: utilisateur.id });
    const [uMbargaManager] = await db
      .insert(utilisateur)
      .values({ entrepriseId: mbargaId, email: "manager-note-mbarga@vertexone.test", nomComplet: "Manager Mbarga", role: "MANAGER" })
      .returning({ id: utilisateur.id });
    adminKiroId = uKiro.id;
    adminMbargaId = uMbargaAdmin.id;
    managerMbargaId = uMbargaManager.id;

    noteMbargaAdminId = await avecEntreprise(mbargaId, async (tx) => {
      const [note] = await tx.insert(notePersonnelle).values({ entrepriseId: mbargaId, utilisateurId: adminMbargaId, contenu: "secret admin Mbarga" }).returning({ id: notePersonnelle.id });
      return note.id;
    });
  }, 30_000);

  afterAll(async () => {
    await avecEntreprise(mbargaId, (tx) => tx.delete(notePersonnelle).where(eq(notePersonnelle.entrepriseId, mbargaId)));
    await db.delete(utilisateur).where(eq(utilisateur.id, adminKiroId));
    await db.delete(utilisateur).where(eq(utilisateur.id, adminMbargaId));
    await db.delete(utilisateur).where(eq(utilisateur.id, managerMbargaId));
    await db.delete(entreprise).where(eq(entreprise.id, kiroId));
    await db.delete(entreprise).where(eq(entreprise.id, mbargaId));
  });

  test("une entreprise ne voit jamais la note d'une autre (RLS)", async () => {
    const depuisKiro = await avecEntreprise(kiroId, (tx) => tx.select().from(notePersonnelle).where(eq(notePersonnelle.id, noteMbargaAdminId)));
    expect(depuisKiro).toHaveLength(0);
  });

  test("la RLS seule laisserait un autre utilisateur de la même entreprise lire la note (preuve du besoin du filtre applicatif)", async () => {
    // Requête volontairement SANS filtre sur utilisateurId — celle que la
    // RLS seule autoriserait pour n'importe qui de la même entreprise
    // (Manager y compris), pour démontrer que entrepriseId ne suffit pas.
    const sansFiltreUtilisateur = await avecEntreprise(mbargaId, (tx) => tx.select().from(notePersonnelle).where(eq(notePersonnelle.entrepriseId, mbargaId)));
    expect(sansFiltreUtilisateur).toHaveLength(1);
    expect(sansFiltreUtilisateur[0].utilisateurId).toBe(adminMbargaId);

    // Avec le filtre que src/lib/actions/note-personnelle.ts applique
    // toujours (utilisateurId = soi-même, jamais un id reçu du client) : le
    // Manager de la même entreprise n'obtient rien, même s'il connaissait
    // l'id de la note.
    const commeUnManagerLirait = await avecEntreprise(mbargaId, (tx) =>
      tx.select().from(notePersonnelle).where(eq(notePersonnelle.utilisateurId, managerMbargaId))
    );
    expect(commeUnManagerLirait).toHaveLength(0);

    const commeLAdminLirait = await avecEntreprise(mbargaId, (tx) => tx.select().from(notePersonnelle).where(eq(notePersonnelle.utilisateurId, adminMbargaId)));
    expect(commeLAdminLirait).toHaveLength(1);
    expect(commeLAdminLirait[0].contenu).toBe("secret admin Mbarga");
  });

  test("une seule note par utilisateur (contrainte unique)", async () => {
    await expect(
      avecEntreprise(mbargaId, (tx) => tx.insert(notePersonnelle).values({ entrepriseId: mbargaId, utilisateurId: adminMbargaId, contenu: "doublon" }))
    ).rejects.toThrow();
  });
});
