import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, utilisateur, serviceReservable, intervenantReservation, disponibiliteReservation, reservation } from "@/db/schema";
import { calculerCreneauxDisponibles, type FenetreHebdo } from "@/lib/reservations/creneaux";
import { genererNumeroReservation } from "@/lib/reservations/numerotation";

const LUNDI_2026_01_05 = new Date("2026-01-05T00:00:00");

// CLAUDE.md : toISOString() convertit en UTC, donc comparer une heure locale
// saisie en dur (ex. "09:00") contre .toISOString().slice(11,16) échoue dès
// que l'hôte n'est pas en UTC (décalage WAT/UTC+1 déjà rencontré ailleurs
// dans ce projet) — toujours comparer via getHours()/getMinutes() locaux.
function versHeureLocale(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

describe("Réservations — calcul des créneaux disponibles (fonction pure)", () => {
  test("aucune fenêtre ce jour-là : aucun créneau", () => {
    const creneaux = calculerCreneauxDisponibles({
      date: LUNDI_2026_01_05,
      fenetres: [{ jourSemaine: "MARDI", heureDebut: "09:00:00", heureFin: "12:00:00" }],
      reservationsExistantes: [],
      dureeServiceMinutes: 30,
      dureeTamponMinutes: 0,
      delaiMinimumHeures: 0,
      maintenant: new Date("2026-01-01T00:00:00"),
    });
    expect(creneaux).toEqual([]);
  });

  test("fenêtre entièrement occupée : aucun créneau", () => {
    const fenetres: FenetreHebdo[] = [{ jourSemaine: "LUNDI", heureDebut: "09:00:00", heureFin: "10:00:00" }];
    const creneaux = calculerCreneauxDisponibles({
      date: LUNDI_2026_01_05,
      fenetres,
      reservationsExistantes: [{ dateDebut: new Date("2026-01-05T09:00:00"), dateFin: new Date("2026-01-05T10:00:00") }],
      dureeServiceMinutes: 60,
      dureeTamponMinutes: 0,
      delaiMinimumHeures: 0,
      maintenant: new Date("2026-01-01T00:00:00"),
    });
    expect(creneaux).toEqual([]);
  });

  test("fenêtre avec un trou : renvoie exactement les créneaux libres autour de la réservation existante", () => {
    const fenetres: FenetreHebdo[] = [{ jourSemaine: "LUNDI", heureDebut: "09:00:00", heureFin: "12:00:00" }];
    const creneaux = calculerCreneauxDisponibles({
      date: LUNDI_2026_01_05,
      fenetres,
      reservationsExistantes: [{ dateDebut: new Date("2026-01-05T10:00:00"), dateFin: new Date("2026-01-05T10:30:00") }],
      dureeServiceMinutes: 30,
      dureeTamponMinutes: 0,
      delaiMinimumHeures: 0,
      maintenant: new Date("2026-01-01T00:00:00"),
    });
    const heures = creneaux.map((c) => versHeureLocale(c));
    expect(heures).toEqual(["09:00", "09:30", "10:30", "11:00", "11:30"]);
  });

  test("préavis minimum : exclut tout créneau avant maintenant + délaiMinimumHeures", () => {
    const fenetres: FenetreHebdo[] = [{ jourSemaine: "LUNDI", heureDebut: "09:00:00", heureFin: "12:00:00" }];
    const creneaux = calculerCreneauxDisponibles({
      date: LUNDI_2026_01_05,
      fenetres,
      reservationsExistantes: [],
      dureeServiceMinutes: 60,
      dureeTamponMinutes: 0,
      delaiMinimumHeures: 3,
      maintenant: new Date("2026-01-05T08:00:00"),
    });
    const heures = creneaux.map((c) => versHeureLocale(c));
    expect(heures).toEqual(["11:00"]);
  });

  test("le tampon bloque un créneau qui serait autrement libre", () => {
    const fenetres: FenetreHebdo[] = [{ jourSemaine: "LUNDI", heureDebut: "09:00:00", heureFin: "12:00:00" }];
    const reservationsExistantes = [{ dateDebut: new Date("2026-01-05T10:35:00"), dateFin: new Date("2026-01-05T11:00:00") }];

    const avecTampon = calculerCreneauxDisponibles({
      date: LUNDI_2026_01_05,
      fenetres,
      reservationsExistantes,
      dureeServiceMinutes: 30,
      dureeTamponMinutes: 15,
      delaiMinimumHeures: 0,
      maintenant: new Date("2026-01-01T00:00:00"),
    });
    expect(avecTampon.map((c) => versHeureLocale(c))).not.toContain("10:00");

    const sansTampon = calculerCreneauxDisponibles({
      date: LUNDI_2026_01_05,
      fenetres,
      reservationsExistantes,
      dureeServiceMinutes: 30,
      dureeTamponMinutes: 0,
      delaiMinimumHeures: 0,
      maintenant: new Date("2026-01-01T00:00:00"),
    });
    expect(sansTampon.map((c) => versHeureLocale(c))).toContain("10:00");
  });
});

describe("Réservations — intégration avec la base réelle", () => {
  let entrepriseId: string;
  let adminId: string;
  let serviceId: string;
  let intervenantId: string;

  beforeAll(async () => {
    const [e] = await db.insert(entreprise).values({ nom: "TEST Reservation Logique", secteurProfil: "agence" }).returning({ id: entreprise.id });
    entrepriseId = e.id;
    const [admin] = await db.insert(utilisateur).values({ entrepriseId, email: "admin-reservation-logique@vertexone.test", nomComplet: "Admin", role: "ADMIN" }).returning({ id: utilisateur.id });
    adminId = admin.id;

    await avecEntreprise(entrepriseId, async (tx) => {
      const [s] = await tx.insert(serviceReservable).values({ entrepriseId, nom: "Coupe", dureeMinutes: 30, creeParId: adminId }).returning({ id: serviceReservable.id });
      serviceId = s.id;
      const [i] = await tx.insert(intervenantReservation).values({ entrepriseId, utilisateurId: adminId }).returning({ id: intervenantReservation.id });
      intervenantId = i.id;
      await tx.insert(disponibiliteReservation).values({ entrepriseId, intervenantId, jourSemaine: "LUNDI", heureDebut: "09:00:00", heureFin: "18:00:00" });
    });
  }, 30_000);

  afterAll(async () => {
    await avecEntreprise(entrepriseId, async (tx) => {
      await tx.delete(reservation).where(eq(reservation.entrepriseId, entrepriseId));
      await tx.delete(disponibiliteReservation).where(eq(disponibiliteReservation.entrepriseId, entrepriseId));
      await tx.delete(intervenantReservation).where(eq(intervenantReservation.entrepriseId, entrepriseId));
      await tx.delete(serviceReservable).where(eq(serviceReservable.entrepriseId, entrepriseId));
    });
    await db.delete(utilisateur).where(eq(utilisateur.id, adminId));
    await db.delete(entreprise).where(eq(entreprise.id, entrepriseId));
  }, 30_000);

  test("genererNumeroReservation() produit des numéros croissants, sans trou", async () => {
    const numero1 = await avecEntreprise(entrepriseId, (tx) => genererNumeroReservation(tx, entrepriseId));
    const numero2 = await avecEntreprise(entrepriseId, (tx) => genererNumeroReservation(tx, entrepriseId));
    const n1 = Number(numero1.split("-")[2]);
    const n2 = Number(numero2.split("-")[2]);
    expect(n2).toBe(n1 + 1);
  });

  test("la contrainte EXCLUDE empêche réellement deux réservations concurrentes sur le même créneau", async () => {
    const dateDebut = new Date("2026-03-02T09:00:00");
    const dateFin = new Date("2026-03-02T09:30:00");

    const inserer = () =>
      avecEntreprise(entrepriseId, (tx) =>
        tx.insert(reservation).values({
          entrepriseId,
          numero: `RDV-TEST-${Math.random()}`,
          serviceId,
          intervenantId,
          dateDebut,
          dateFin,
          dureeMinutesReservee: 30,
          prixFcfaReserve: 0,
          clientNom: "Client Test",
          clientTelephone: "699000000",
        })
      );

    const resultats = await Promise.allSettled([inserer(), inserer()]);
    const reussies = resultats.filter((r) => r.status === "fulfilled");
    const echouees = resultats.filter((r) => r.status === "rejected");

    expect(reussies).toHaveLength(1);
    expect(echouees).toHaveLength(1);
    if (echouees[0].status === "rejected") {
      const raison = echouees[0].reason as { code?: string; cause?: { code?: string } };
      expect(raison.code ?? raison.cause?.code).toBe("23P01");
    }
  });
});
