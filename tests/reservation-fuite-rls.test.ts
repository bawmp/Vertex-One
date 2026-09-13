import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, utilisateur, serviceReservable, intervenantReservation, reservation, parametreReservation } from "@/db/schema";

/**
 * Test de fuite délibérée entre deux entreprises fictives — voir CLAUDE.md :
 * "après chaque nouveau module touchant à des données d'entreprise, un test
 * délibéré doit vérifier qu'une entreprise fictive ne peut techniquement pas
 * accéder aux données d'une autre."
 */
describe("Réservations — isolation RLS entre entreprises", () => {
  let kiroId: string;
  let mbargaId: string;
  let utilisateurKiroId: string;
  let utilisateurMbargaId: string;
  let serviceMbargaId: string;
  let intervenantMbargaId: string;
  let reservationMbargaId: string;

  beforeAll(async () => {
    const [kiro] = await db.insert(entreprise).values({ nom: "TEST Reservation Agence Kiro", secteurProfil: "agence" }).returning({ id: entreprise.id });
    const [mbarga] = await db.insert(entreprise).values({ nom: "TEST Reservation Garage Mbarga", secteurProfil: "artisan" }).returning({ id: entreprise.id });
    kiroId = kiro.id;
    mbargaId = mbarga.id;

    const [uKiro] = await db.insert(utilisateur).values({ entrepriseId: kiroId, email: "admin-reservation-kiro@vertexone.test", nomComplet: "Admin Kiro", role: "ADMIN" }).returning({ id: utilisateur.id });
    const [uMbarga] = await db
      .insert(utilisateur)
      .values({ entrepriseId: mbargaId, email: "admin-reservation-mbarga@vertexone.test", nomComplet: "Admin Mbarga", role: "ADMIN" })
      .returning({ id: utilisateur.id });
    utilisateurKiroId = uKiro.id;
    utilisateurMbargaId = uMbarga.id;

    await avecEntreprise(mbargaId, async (tx) => {
      const [s] = await tx.insert(serviceReservable).values({ entrepriseId: mbargaId, nom: "Vidange", dureeMinutes: 30, creeParId: utilisateurMbargaId }).returning({ id: serviceReservable.id });
      serviceMbargaId = s.id;
      const [i] = await tx.insert(intervenantReservation).values({ entrepriseId: mbargaId, utilisateurId: utilisateurMbargaId }).returning({ id: intervenantReservation.id });
      intervenantMbargaId = i.id;
      const [r] = await tx
        .insert(reservation)
        .values({
          entrepriseId: mbargaId,
          numero: "RDV-TEST-FUITE",
          serviceId: serviceMbargaId,
          intervenantId: intervenantMbargaId,
          dateDebut: new Date("2026-04-01T09:00:00"),
          dateFin: new Date("2026-04-01T09:30:00"),
          dureeMinutesReservee: 30,
          prixFcfaReserve: 0,
          clientNom: "Client Mbarga",
          clientTelephone: "699111111",
        })
        .returning({ id: reservation.id });
      reservationMbargaId = r.id;
    });
  }, 30_000);

  afterAll(async () => {
    for (const id of [kiroId, mbargaId]) {
      await avecEntreprise(id, async (tx) => {
        await tx.delete(reservation).where(eq(reservation.entrepriseId, id));
        await tx.delete(intervenantReservation).where(eq(intervenantReservation.entrepriseId, id));
        await tx.delete(serviceReservable).where(eq(serviceReservable.entrepriseId, id));
        await tx.delete(parametreReservation).where(eq(parametreReservation.entrepriseId, id));
      });
    }
    await db.delete(utilisateur).where(eq(utilisateur.id, utilisateurKiroId));
    await db.delete(utilisateur).where(eq(utilisateur.id, utilisateurMbargaId));
    await db.delete(entreprise).where(eq(entreprise.id, kiroId));
    await db.delete(entreprise).where(eq(entreprise.id, mbargaId));
  }, 30_000);

  test("une entreprise ne voit pas, ne peut pas modifier, ni supprimer la réservation d'une autre", async () => {
    const lecture = await avecEntreprise(kiroId, (tx) => tx.select().from(reservation).where(eq(reservation.id, reservationMbargaId)));
    expect(lecture).toHaveLength(0);

    await avecEntreprise(kiroId, (tx) => tx.update(reservation).set({ clientNom: "pirate" }).where(eq(reservation.id, reservationMbargaId)));
    const [reel] = await avecEntreprise(mbargaId, (tx) => tx.select().from(reservation).where(eq(reservation.id, reservationMbargaId)));
    expect(reel.clientNom).not.toBe("pirate");

    await avecEntreprise(kiroId, (tx) => tx.delete(reservation).where(eq(reservation.id, reservationMbargaId)));
    const [toujoursLa] = await avecEntreprise(mbargaId, (tx) => tx.select().from(reservation).where(eq(reservation.id, reservationMbargaId)));
    expect(toujoursLa).toBeDefined();
  });

  test("parametreReservation : visible anonymement seulement quand publie = true", async () => {
    await avecEntreprise(mbargaId, (tx) => tx.insert(parametreReservation).values({ entrepriseId: mbargaId, slug: `test-fuite-${Date.now()}`, publie: false }));

    const [ligne] = await avecEntreprise(mbargaId, (tx) => tx.select({ slug: parametreReservation.slug, publie: parametreReservation.publie }).from(parametreReservation).where(eq(parametreReservation.entrepriseId, mbargaId)));

    // Lecture anonyme (aucune session, db direct) : invisible tant que publie = false.
    const anonymeAvantPublication = await db.select().from(parametreReservation).where(eq(parametreReservation.slug, ligne.slug));
    expect(anonymeAvantPublication).toHaveLength(0);

    await avecEntreprise(mbargaId, (tx) => tx.update(parametreReservation).set({ publie: true }).where(eq(parametreReservation.entrepriseId, mbargaId)));

    const anonymeApresPublication = await db.select().from(parametreReservation).where(eq(parametreReservation.slug, ligne.slug));
    expect(anonymeApresPublication).toHaveLength(1);
  });
});
