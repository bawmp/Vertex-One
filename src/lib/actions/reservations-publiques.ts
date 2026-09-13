"use server";

import { z } from "zod";
import { and, eq, gte, inArray, lt } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, parametreReservation, serviceReservable, intervenantReservation, disponibiliteReservation, reservation, utilisateur } from "@/db/schema";
import { disponibleAddon } from "@/lib/plans";
import { calculerCreneauxDisponibles, type JourSemaine } from "@/lib/reservations/creneaux";
import { genererNumeroReservation } from "@/lib/reservations/numerotation";
import { resoudreContactOptionnel } from "@/lib/reservations/contact";

/**
 * Actions publiques, sans session — voir src/lib/actions/page-atterrissage.ts
 * (soumettreFormulaireContact) pour le patron exact répliqué ici :
 * entrepriseId toujours re-résolu côté serveur depuis le slug (jamais reçu
 * du client), puis avecEntreprise() pour toute lecture/écriture réelle.
 */

export type ParametresPublics = { entrepriseId: string; titre: string; texte: string | null; delaiMinimumHeures: number; delaiMaximumJours: number };

export async function resoudreParametresPublics(slug: string): Promise<ParametresPublics | null> {
  const [params] = await db
    .select({
      entrepriseId: parametreReservation.entrepriseId,
      titre: parametreReservation.titre,
      texte: parametreReservation.texte,
      delaiMinimumHeures: parametreReservation.delaiMinimumHeures,
      delaiMaximumJours: parametreReservation.delaiMaximumJours,
    })
    .from(parametreReservation)
    .where(and(eq(parametreReservation.slug, slug), eq(parametreReservation.publie, true)));
  if (!params) return null;

  const actif = await avecEntreprise(params.entrepriseId, async (tx) => {
    const [monEntreprise] = await tx.select({ id: entreprise.id, statutAbonnement: entreprise.statutAbonnement }).from(entreprise).where(eq(entreprise.id, params.entrepriseId));
    if (!monEntreprise) return false;
    return disponibleAddon(tx, monEntreprise, "RESERVATIONS");
  });
  if (!actif) return null;

  return params;
}

export type ServicePublic = { id: string; nom: string; description: string | null; dureeMinutes: number; dureeTamponMinutes: number; prixFcfa: number };
export type IntervenantPublic = { id: string; nomComplet: string };

export async function obtenirServicesEtIntervenants(slug: string): Promise<{ services: ServicePublic[]; intervenants: IntervenantPublic[] } | null> {
  const params = await resoudreParametresPublics(slug);
  if (!params) return null;

  return avecEntreprise(params.entrepriseId, async (tx) => {
    const services = await tx
      .select({ id: serviceReservable.id, nom: serviceReservable.nom, description: serviceReservable.description, dureeMinutes: serviceReservable.dureeMinutes, dureeTamponMinutes: serviceReservable.dureeTamponMinutes, prixFcfa: serviceReservable.prixFcfa })
      .from(serviceReservable)
      .where(and(eq(serviceReservable.entrepriseId, params.entrepriseId), eq(serviceReservable.actif, true)));

    const intervenants = await tx
      .select({ id: intervenantReservation.id, nomComplet: utilisateur.nomComplet })
      .from(intervenantReservation)
      .innerJoin(utilisateur, eq(intervenantReservation.utilisateurId, utilisateur.id))
      .where(and(eq(intervenantReservation.entrepriseId, params.entrepriseId), eq(intervenantReservation.actif, true)));

    return { services, intervenants };
  });
}

function debutJournee(dateIso: string): Date {
  const d = new Date(`${dateIso}T00:00:00`);
  return d;
}

async function calculerCreneauxPourJour(
  entrepriseId: string,
  serviceId: string,
  intervenantId: string,
  dateIso: string,
  delaiMinimumHeures: number
): Promise<Date[] | null> {
  return avecEntreprise(entrepriseId, async (tx) => {
    const [service] = await tx
      .select({ dureeMinutes: serviceReservable.dureeMinutes, dureeTamponMinutes: serviceReservable.dureeTamponMinutes })
      .from(serviceReservable)
      .where(and(eq(serviceReservable.id, serviceId), eq(serviceReservable.entrepriseId, entrepriseId), eq(serviceReservable.actif, true)));
    if (!service) return null;

    const [intervenant] = await tx
      .select({ id: intervenantReservation.id })
      .from(intervenantReservation)
      .where(and(eq(intervenantReservation.id, intervenantId), eq(intervenantReservation.entrepriseId, entrepriseId), eq(intervenantReservation.actif, true)));
    if (!intervenant) return null;

    const fenetres = await tx
      .select({ jourSemaine: disponibiliteReservation.jourSemaine, heureDebut: disponibiliteReservation.heureDebut, heureFin: disponibiliteReservation.heureFin })
      .from(disponibiliteReservation)
      .where(eq(disponibiliteReservation.intervenantId, intervenantId));

    const jour = debutJournee(dateIso);
    const lendemain = new Date(jour);
    lendemain.setDate(lendemain.getDate() + 1);

    const reservationsExistantes = await tx
      .select({ dateDebut: reservation.dateDebut, dateFin: reservation.dateFin })
      .from(reservation)
      .where(and(eq(reservation.intervenantId, intervenantId), inArray(reservation.statut, ["CONFIRMEE", "TERMINEE"]), gte(reservation.dateDebut, jour), lt(reservation.dateDebut, lendemain)));

    return calculerCreneauxDisponibles({
      date: jour,
      fenetres: fenetres.map((f) => ({ jourSemaine: f.jourSemaine as JourSemaine, heureDebut: f.heureDebut, heureFin: f.heureFin })),
      reservationsExistantes,
      dureeServiceMinutes: service.dureeMinutes,
      dureeTamponMinutes: service.dureeTamponMinutes,
      delaiMinimumHeures,
      maintenant: new Date(),
    });
  });
}

export async function obtenirCreneauxDisponibles(slug: string, serviceId: string, intervenantId: string, dateIso: string): Promise<Date[]> {
  const params = await resoudreParametresPublics(slug);
  if (!params) return [];
  const creneaux = await calculerCreneauxPourJour(params.entrepriseId, serviceId, intervenantId, dateIso, params.delaiMinimumHeures);
  return creneaux ?? [];
}

const schemaReservation = z.object({
  slug: z.string(),
  serviceId: z.string(),
  intervenantId: z.string(),
  dateDebut: z.string(), // ISO complet, ex. "2026-09-20T14:00:00.000Z"
  clientNom: z.string().trim().min(2, "Le nom est trop court."),
  clientTelephone: z.string().trim().min(6, "Numéro de téléphone invalide."),
  clientEmail: z.email().optional().or(z.literal("")),
  notes: z.string().trim().optional(),
});

export type EtatReservationPublique = { erreur?: string; succes?: boolean; numero?: string } | null;

export async function creerReservationPublique(_etat: EtatReservationPublique, formData: FormData): Promise<EtatReservationPublique> {
  const analyse = schemaReservation.safeParse({
    slug: formData.get("slug"),
    serviceId: formData.get("serviceId"),
    intervenantId: formData.get("intervenantId"),
    dateDebut: formData.get("dateDebut"),
    clientNom: formData.get("clientNom"),
    clientTelephone: formData.get("clientTelephone"),
    clientEmail: formData.get("clientEmail") || "",
    notes: formData.get("notes") || "",
  });
  if (!analyse.success) {
    return { erreur: analyse.error.issues[0]?.message ?? "Formulaire invalide." };
  }
  const { slug, serviceId, intervenantId, dateDebut, clientNom, clientTelephone, clientEmail, notes } = analyse.data;

  const params = await resoudreParametresPublics(slug);
  if (!params) return { erreur: "Cette page de réservation n'est plus disponible." };

  const dateDebutDemandee = new Date(dateDebut);
  const dateIso = dateDebut.slice(0, 10);

  // Revalidation serveur du créneau — jamais une confiance dans le créneau
  // choisi côté client, la disponibilité a pu changer entre l'affichage de
  // la page et la soumission du formulaire.
  const creneauxValides = await calculerCreneauxPourJour(params.entrepriseId, serviceId, intervenantId, dateIso, params.delaiMinimumHeures);
  if (!creneauxValides || !creneauxValides.some((c) => c.getTime() === dateDebutDemandee.getTime())) {
    return { erreur: "Ce créneau n'est plus disponible — choisissez-en un autre." };
  }

  const resultat = await avecEntreprise(params.entrepriseId, async (tx) => {
    const [service] = await tx.select().from(serviceReservable).where(eq(serviceReservable.id, serviceId));
    if (!service) return { erreur: "Service introuvable." };

    const dateFin = new Date(dateDebutDemandee.getTime() + (service.dureeMinutes + service.dureeTamponMinutes) * 60 * 1000);
    const contactId = await resoudreContactOptionnel(tx, params.entrepriseId, clientTelephone, clientEmail || undefined);
    const numero = await genererNumeroReservation(tx, params.entrepriseId);

    try {
      await tx.insert(reservation).values({
        entrepriseId: params.entrepriseId,
        numero,
        serviceId,
        intervenantId,
        dateDebut: dateDebutDemandee,
        dateFin,
        dureeMinutesReservee: service.dureeMinutes,
        prixFcfaReserve: service.prixFcfa,
        clientNom,
        clientTelephone,
        clientEmail: clientEmail || undefined,
        notes: notes || undefined,
        contactId: contactId ?? undefined,
      });
    } catch (erreur) {
      // 23P01 = exclusion_violation — la contrainte EXCLUDE (drizzle/0075_*)
      // a bloqué une réservation concurrente sur le même créneau, gagnée par
      // une autre transaction entre notre revalidation et cet insert.
      if (erreur && typeof erreur === "object" && "code" in erreur && erreur.code === "23P01") {
        return { erreur: "Ce créneau vient d'être réservé par quelqu'un d'autre — choisissez-en un autre." };
      }
      throw erreur;
    }

    return { succes: true as const, numero };
  });

  return resultat;
}
