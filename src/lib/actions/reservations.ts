"use server";

import { z } from "zod";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { avecEntreprise, type TransactionDrizzle } from "@/db/client";
import { entreprise, parametreReservation, serviceReservable, intervenantReservation, disponibiliteReservation, reservation } from "@/db/schema";
import { recupererUtilisateurConnecte, type UtilisateurConnecte } from "@/lib/session";
import { disponibleAddon } from "@/lib/plans";
import { idsVisibles } from "@/lib/portee";

const CHEMIN = "/app/reservations";

export type EtatReservationConfig = { erreur?: string } | null;

/**
 * Configuration (paramètres publics, services, personnel, disponibilités) —
 * décision structurante, réservée à l'Administrateur, même niveau que
 * creerShift()/creerPolitiqueConge() : MODIFIER est aussi accordé à
 * Manager/Employé dans la matrice de permissions (src/lib/permissions.ts)
 * mais seulement pour la gestion de leurs propres rendez-vous plus bas dans
 * ce fichier, jamais la configuration.
 */

const schemaParametres = z.object({
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9-]+$/, "Le lien ne peut contenir que des lettres minuscules, chiffres et tirets."),
  titre: z.string().trim().min(2, "Le titre est requis."),
  texte: z.string().trim().optional(),
  delaiMinimumHeures: z.coerce.number().int().min(0, "Le préavis minimum doit être positif ou nul."),
  delaiMaximumJours: z.coerce.number().int().min(1, "L'horizon de réservation doit être d'au moins un jour."),
});

export async function configurerParametresReservation(_etat: EtatReservationConfig, formData: FormData): Promise<EtatReservationConfig> {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (utilisateurConnecte.role !== "ADMIN") {
    return { erreur: "Seul l'Administrateur peut configurer les réservations." };
  }

  const analyse = schemaParametres.safeParse({
    slug: formData.get("slug"),
    titre: formData.get("titre"),
    texte: formData.get("texte") || "",
    delaiMinimumHeures: formData.get("delaiMinimumHeures"),
    delaiMaximumJours: formData.get("delaiMaximumJours"),
  });
  if (!analyse.success) {
    return { erreur: analyse.error.issues[0]?.message ?? "Formulaire invalide." };
  }
  const { slug, titre, texte, delaiMinimumHeures, delaiMaximumJours } = analyse.data;

  const resultat = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [monEntreprise] = await tx.select().from(entreprise).where(eq(entreprise.id, utilisateurConnecte.entrepriseId));
    if (!(await disponibleAddon(tx, monEntreprise, "RESERVATIONS"))) {
      return { erreur: "Le module Réservations n'est pas activé pour votre entreprise." };
    }

    const [existant] = await tx.select({ id: parametreReservation.id }).from(parametreReservation).where(eq(parametreReservation.entrepriseId, utilisateurConnecte.entrepriseId));

    try {
      if (existant) {
        await tx.update(parametreReservation).set({ slug, titre, texte: texte || null, delaiMinimumHeures, delaiMaximumJours }).where(eq(parametreReservation.id, existant.id));
      } else {
        await tx.insert(parametreReservation).values({ entrepriseId: utilisateurConnecte.entrepriseId, slug, titre, texte: texte || undefined, delaiMinimumHeures, delaiMaximumJours });
      }
    } catch {
      return { erreur: "Ce lien est déjà utilisé — choisissez-en un autre." };
    }
    return null;
  });

  if (resultat?.erreur) return resultat;

  revalidatePath(`${CHEMIN}/parametres`);
  return null;
}

export async function publierReservations(publie: boolean) {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (utilisateurConnecte.role !== "ADMIN") return;

  await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) => tx.update(parametreReservation).set({ publie }).where(eq(parametreReservation.entrepriseId, utilisateurConnecte.entrepriseId)));

  revalidatePath(`${CHEMIN}/parametres`);
}

const schemaService = z.object({
  nom: z.string().trim().min(1, "Le nom est requis."),
  description: z.string().trim().optional(),
  dureeMinutes: z.coerce.number().int().min(5, "La durée doit être d'au moins 5 minutes."),
  dureeTamponMinutes: z.coerce.number().int().min(0, "Le battement doit être positif ou nul.").default(0),
  prixFcfa: z.coerce.number().int().min(0, "Le prix doit être positif ou nul.").default(0),
});

export async function creerServiceReservable(_etat: EtatReservationConfig, formData: FormData): Promise<EtatReservationConfig> {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (utilisateurConnecte.role !== "ADMIN") {
    return { erreur: "Seul l'Administrateur peut créer un service." };
  }

  const analyse = schemaService.safeParse({
    nom: formData.get("nom"),
    description: formData.get("description") || "",
    dureeMinutes: formData.get("dureeMinutes"),
    dureeTamponMinutes: formData.get("dureeTamponMinutes") || 0,
    prixFcfa: formData.get("prixFcfa") || 0,
  });
  if (!analyse.success) {
    return { erreur: analyse.error.issues[0]?.message ?? "Formulaire invalide." };
  }
  const { nom, description, dureeMinutes, dureeTamponMinutes, prixFcfa } = analyse.data;

  const resultat = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [monEntreprise] = await tx.select().from(entreprise).where(eq(entreprise.id, utilisateurConnecte.entrepriseId));
    if (!(await disponibleAddon(tx, monEntreprise, "RESERVATIONS"))) {
      return { erreur: "Le module Réservations n'est pas activé pour votre entreprise." };
    }

    await tx.insert(serviceReservable).values({
      entrepriseId: utilisateurConnecte.entrepriseId,
      nom,
      description: description || undefined,
      dureeMinutes,
      dureeTamponMinutes,
      prixFcfa,
      creeParId: utilisateurConnecte.utilisateurId,
    });
    return null;
  });

  if (resultat?.erreur) return resultat;

  revalidatePath(`${CHEMIN}/services`);
  return null;
}

export async function desactiverServiceReservable(serviceId: string) {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (utilisateurConnecte.role !== "ADMIN") return;

  await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) => tx.update(serviceReservable).set({ actif: false }).where(eq(serviceReservable.id, serviceId)));

  revalidatePath(`${CHEMIN}/services`);
}

/**
 * Bascule un utilisateur en personnel réservable — upsert explicite (pas un
 * simple insert) car intervenant_reservation.utilisateur_id est unique : un
 * utilisateur déjà désactivé doit être réactivé, jamais dupliqué.
 */
export async function definirIntervenant(utilisateurId: string, actif: boolean) {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (utilisateurConnecte.role !== "ADMIN") return;

  await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [existant] = await tx.select({ id: intervenantReservation.id }).from(intervenantReservation).where(eq(intervenantReservation.utilisateurId, utilisateurId));
    if (existant) {
      await tx.update(intervenantReservation).set({ actif }).where(eq(intervenantReservation.id, existant.id));
    } else if (actif) {
      await tx.insert(intervenantReservation).values({ entrepriseId: utilisateurConnecte.entrepriseId, utilisateurId, actif: true });
    }
  });

  revalidatePath(`${CHEMIN}/staff`);
}

const schemaDisponibilite = z.object({
  intervenantId: z.string().min(1),
  jourSemaine: z.enum(["LUNDI", "MARDI", "MERCREDI", "JEUDI", "VENDREDI", "SAMEDI", "DIMANCHE"]),
  heureDebut: z.string().regex(/^\d{2}:\d{2}$/, "Heure invalide (HH:MM)."),
  heureFin: z.string().regex(/^\d{2}:\d{2}$/, "Heure invalide (HH:MM)."),
});

export async function ajouterDisponibilite(_etat: EtatReservationConfig, formData: FormData): Promise<EtatReservationConfig> {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (utilisateurConnecte.role !== "ADMIN") {
    return { erreur: "Seul l'Administrateur peut modifier une disponibilité." };
  }

  const analyse = schemaDisponibilite.safeParse({
    intervenantId: formData.get("intervenantId"),
    jourSemaine: formData.get("jourSemaine"),
    heureDebut: formData.get("heureDebut"),
    heureFin: formData.get("heureFin"),
  });
  if (!analyse.success) {
    return { erreur: analyse.error.issues[0]?.message ?? "Formulaire invalide." };
  }
  const { intervenantId, jourSemaine, heureDebut, heureFin } = analyse.data;

  await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) =>
    tx.insert(disponibiliteReservation).values({ entrepriseId: utilisateurConnecte.entrepriseId, intervenantId, jourSemaine, heureDebut, heureFin })
  );

  revalidatePath(`${CHEMIN}/staff`);
  return null;
}

export async function supprimerDisponibilite(disponibiliteId: string) {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (utilisateurConnecte.role !== "ADMIN") return;

  await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) => tx.delete(disponibiliteReservation).where(eq(disponibiliteReservation.id, disponibiliteId)));

  revalidatePath(`${CHEMIN}/staff`);
}

/**
 * Portée sur QUEL rendez-vous (pas la configuration ci-dessus, toujours
 * Admin) — filtrée directement sur reservation.intervenantId ->
 * intervenant_reservation.utilisateur_id, jamais via une jointure vers un
 * autre module (voir CLAUDE.md).
 */
async function reservationDansLaPortee(tx: TransactionDrizzle, utilisateurConnecte: UtilisateurConnecte, reservationId: string): Promise<boolean> {
  const ids = await idsVisibles(tx, utilisateurConnecte, "RESERVATIONS");
  if (ids === "TOUT") return true;

  const [ligne] = await tx
    .select({ utilisateurId: intervenantReservation.utilisateurId })
    .from(reservation)
    .innerJoin(intervenantReservation, eq(reservation.intervenantId, intervenantReservation.id))
    .where(eq(reservation.id, reservationId));

  return ligne ? ids.includes(ligne.utilisateurId) : false;
}

export async function annulerReservation(reservationId: string, motif: string) {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");

  await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    if (!(await reservationDansLaPortee(tx, utilisateurConnecte, reservationId))) return;
    await tx.update(reservation).set({ statut: "ANNULEE", motifAnnulation: motif || undefined, annuleeLe: new Date() }).where(eq(reservation.id, reservationId));
  });

  revalidatePath(CHEMIN);
}

export async function marquerAbsence(reservationId: string) {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");

  await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    if (!(await reservationDansLaPortee(tx, utilisateurConnecte, reservationId))) return;
    await tx.update(reservation).set({ statut: "ABSENCE" }).where(eq(reservation.id, reservationId));
  });

  revalidatePath(CHEMIN);
}

export async function marquerTerminee(reservationId: string) {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");

  await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    if (!(await reservationDansLaPortee(tx, utilisateurConnecte, reservationId))) return;
    await tx.update(reservation).set({ statut: "TERMINEE" }).where(eq(reservation.id, reservationId));
  });

  revalidatePath(CHEMIN);
}
