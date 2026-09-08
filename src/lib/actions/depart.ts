"use server";

import { z } from "zod";
import { eq, and, inArray } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { avecEntreprise } from "@/db/client";
import { db } from "@/db/client";
import { entreprise, dossierRH, demandeDepart, clearanceDepart, utilisateur, session } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut, portee } from "@/lib/permissions";
import { disponible } from "@/lib/plans";
import { idsVisibles } from "@/lib/portee";

const cheminDossier = (dossierRHId: string) => `/app/rh/${dossierRHId}/depart`;

export type EtatDepart = { erreur?: string } | null;

const schemaDemande = z.object({
  type: z.enum(["DEMISSION", "LICENCIEMENT", "FIN_CONTRAT", "AUTRE"]),
  dateDepartSouhaitee: z.string().min(1, "La date de départ souhaitée est requise."),
  motif: z.string().trim().optional(),
});

/**
 * Toujours pour son propre Dossier RH, jamais un dossierRHId envoyé par le
 * client (même choix que creerDemandeConge(), src/lib/actions/rh.ts) —
 * contrairement à Zoho qui autorise un Manager/Admin à initier au nom d'un
 * tiers, gardé simple ici tant qu'aucun vrai besoin ne l'exige.
 */
export async function creerDemandeDepart(_etat: EtatDepart, formData: FormData): Promise<EtatDepart> {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte.role, "RH", "CREER")) {
    return { erreur: "Vous n'avez pas le droit de faire une demande de départ." };
  }

  const analyse = schemaDemande.safeParse({
    type: formData.get("type"),
    dateDepartSouhaitee: formData.get("dateDepartSouhaitee"),
    motif: formData.get("motif") || undefined,
  });
  if (!analyse.success) {
    return { erreur: analyse.error.issues[0]?.message ?? "Formulaire invalide." };
  }
  const { type, dateDepartSouhaitee, motif } = analyse.data;

  const resultat = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [monEntreprise] = await tx.select().from(entreprise).where(eq(entreprise.id, utilisateurConnecte.entrepriseId));
    if (!disponible(monEntreprise, "RH")) return { erreur: "Les Ressources Humaines sont disponibles à partir du forfait Business." };

    const [monDossier] = await tx.select({ id: dossierRH.id }).from(dossierRH).where(eq(dossierRH.utilisateurId, utilisateurConnecte.utilisateurId));
    if (!monDossier) return { erreur: "Aucun dossier RH associé à votre compte." };

    const [demandeExistante] = await tx
      .select({ id: demandeDepart.id })
      .from(demandeDepart)
      .where(and(eq(demandeDepart.dossierRHId, monDossier.id), inArray(demandeDepart.statut, ["EN_ATTENTE", "APPROUVEE"])));
    if (demandeExistante) return { erreur: "Une demande de départ est déjà en cours pour votre dossier." };

    await tx.insert(demandeDepart).values({
      entrepriseId: utilisateurConnecte.entrepriseId,
      dossierRHId: monDossier.id,
      type,
      dateDepartSouhaitee: new Date(dateDepartSouhaitee),
      motif,
      creeParId: utilisateurConnecte.utilisateurId,
    });

    return { erreur: undefined, dossierRHId: monDossier.id };
  });

  if (resultat?.erreur) return { erreur: resultat.erreur };

  revalidatePath(cheminDossier((resultat as { dossierRHId: string }).dossierRHId));
  return null;
}

/**
 * Vérifie que le dossier concerné est bien dans la portée de qui approuve
 * (même garde que traiterDemandeConge()) — un Manager ne peut pas traiter le
 * départ d'un employé hors de son équipe même en devinant l'id de la demande.
 */
export async function traiterDemandeDepart(demandeId: string, decision: "approuver" | "refuser", dateDepartConfirmee?: string) {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte.role, "RH", "MODIFIER")) return;

  let dossierRHId: string | null = null;

  await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [demande] = await tx.select().from(demandeDepart).where(eq(demandeDepart.id, demandeId));
    if (!demande || demande.statut !== "EN_ATTENTE") return;

    const [leDossier] = await tx.select({ utilisateurId: dossierRH.utilisateurId }).from(dossierRH).where(eq(dossierRH.id, demande.dossierRHId));
    if (!leDossier) return;

    if (portee(utilisateurConnecte.role, "RH") !== "TOUT") {
      const ids = await idsVisibles(tx, utilisateurConnecte, "RH");
      if (ids !== "TOUT" && !ids.includes(leDossier.utilisateurId)) return;
    }

    dossierRHId = demande.dossierRHId;

    if (decision === "approuver") {
      await tx
        .update(demandeDepart)
        .set({
          statut: "APPROUVEE",
          dateDepartConfirmee: dateDepartConfirmee ? new Date(dateDepartConfirmee) : demande.dateDepartSouhaitee,
          approuveParId: utilisateurConnecte.utilisateurId,
        })
        .where(eq(demandeDepart.id, demandeId));
    } else {
      await tx.update(demandeDepart).set({ statut: "REFUSEE", approuveParId: utilisateurConnecte.utilisateurId }).where(eq(demandeDepart.id, demandeId));
    }
  });

  if (dossierRHId) revalidatePath(cheminDossier(dossierRHId));
}

const schemaClearance = z.object({
  demandeDepartId: z.string().min(1),
  libelle: z.string().trim().min(1, "Le libellé est requis."),
  responsableId: z.string().min(1, "Le responsable est requis."),
});

/**
 * Items ad hoc (échange du 2026-09-08) — pas de modèle réutilisable dans
 * cette tranche, voir schema.ts. Réservé à qui peut traiter la demande
 * (même portée que traiterDemandeDepart), la demande doit déjà être
 * approuvée.
 */
export async function ajouterClearance(_etat: EtatDepart, formData: FormData): Promise<EtatDepart> {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte.role, "RH", "MODIFIER")) {
    return { erreur: "Vous n'avez pas le droit d'ajouter une clôture." };
  }

  const analyse = schemaClearance.safeParse({
    demandeDepartId: formData.get("demandeDepartId"),
    libelle: formData.get("libelle"),
    responsableId: formData.get("responsableId"),
  });
  if (!analyse.success) {
    return { erreur: analyse.error.issues[0]?.message ?? "Formulaire invalide." };
  }
  const { demandeDepartId, libelle, responsableId } = analyse.data;

  const resultat = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [demande] = await tx.select({ statut: demandeDepart.statut, dossierRHId: demandeDepart.dossierRHId }).from(demandeDepart).where(eq(demandeDepart.id, demandeDepartId));
    if (!demande) return { erreur: "Demande de départ introuvable." };
    if (demande.statut !== "APPROUVEE") return { erreur: "La demande doit être approuvée avant d'ajouter une clôture." };

    if (portee(utilisateurConnecte.role, "RH") !== "TOUT") {
      const [leDossier] = await tx.select({ utilisateurId: dossierRH.utilisateurId }).from(dossierRH).where(eq(dossierRH.id, demande.dossierRHId));
      const ids = await idsVisibles(tx, utilisateurConnecte, "RH");
      if (!leDossier || (ids !== "TOUT" && !ids.includes(leDossier.utilisateurId))) return { erreur: "Ce dossier n'est pas dans votre équipe." };
    }

    await tx.insert(clearanceDepart).values({ entrepriseId: utilisateurConnecte.entrepriseId, demandeDepartId, libelle, responsableId });

    return { dossierRHId: demande.dossierRHId };
  });

  if ("erreur" in resultat && resultat.erreur) return { erreur: resultat.erreur };

  revalidatePath(cheminDossier((resultat as { dossierRHId: string }).dossierRHId));
  return null;
}

/**
 * Le responsable désigné peut valider SA propre clôture même sans droit RH
 * général (même principe que le pointage, toujours pour soi-même) — un
 * Administrateur peut aussi valider n'importe quelle clôture.
 */
export async function validerClearance(clearanceId: string) {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");

  let dossierRHId: string | null = null;

  await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [laClearance] = await tx.select().from(clearanceDepart).where(eq(clearanceDepart.id, clearanceId));
    if (!laClearance) return;

    const estResponsable = laClearance.responsableId === utilisateurConnecte.utilisateurId;
    if (!estResponsable && utilisateurConnecte.role !== "ADMIN") return;

    const [demande] = await tx.select({ dossierRHId: demandeDepart.dossierRHId }).from(demandeDepart).where(eq(demandeDepart.id, laClearance.demandeDepartId));
    if (!demande) return;
    dossierRHId = demande.dossierRHId;

    await tx.update(clearanceDepart).set({ complete: true, completeLe: new Date() }).where(eq(clearanceDepart.id, clearanceId));
  });

  if (dossierRHId) revalidatePath(cheminDossier(dossierRHId));
}

export async function supprimerClearance(clearanceId: string) {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte.role, "RH", "MODIFIER")) return;

  let dossierRHId: string | null = null;

  await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [laClearance] = await tx.select().from(clearanceDepart).where(eq(clearanceDepart.id, clearanceId));
    if (!laClearance) return;

    if (portee(utilisateurConnecte.role, "RH") !== "TOUT") {
      const [demande] = await tx.select({ dossierRHId: demandeDepart.dossierRHId }).from(demandeDepart).where(eq(demandeDepart.id, laClearance.demandeDepartId));
      if (!demande) return;
      const [leDossier] = await tx.select({ utilisateurId: dossierRH.utilisateurId }).from(dossierRH).where(eq(dossierRH.id, demande.dossierRHId));
      const ids = await idsVisibles(tx, utilisateurConnecte, "RH");
      if (!leDossier || (ids !== "TOUT" && !ids.includes(leDossier.utilisateurId))) return;
    }

    const [demande] = await tx.select({ dossierRHId: demandeDepart.dossierRHId }).from(demandeDepart).where(eq(demandeDepart.id, laClearance.demandeDepartId));
    dossierRHId = demande?.dossierRHId ?? null;

    await tx.delete(clearanceDepart).where(eq(clearanceDepart.id, clearanceId));
  });

  if (dossierRHId) revalidatePath(cheminDossier(dossierRHId));
}

const schemaCloture = z.object({
  demandeDepartId: z.string().min(1),
  entretienSortie: z.string().trim().optional(),
});

/**
 * Clôture (échange du 2026-09-08) : réservée à l'Administrateur (même
 * niveau que modifierDossierRH()/reviserSalaire() — mettre fin à une
 * relation de travail est une décision structurante). Bloque tant qu'une
 * clôture (clearance) reste incomplète — l'Admin doit d'abord la valider ou
 * la supprimer explicitement, jamais un simple avertissement ignorable.
 *
 * Révoque l'accès réellement, pas seulement en apparence : utilisateur.statut
 * passe à DESACTIVE (désormais appliqué par recupererUtilisateurConnecte(),
 * voir src/lib/session.ts) et ses sessions actives sont supprimées pour
 * forcer une déconnexion immédiate plutôt que d'attendre l'expiration du
 * cookie.
 */
export async function cloturerDepart(_etat: EtatDepart, formData: FormData): Promise<EtatDepart> {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (utilisateurConnecte.role !== "ADMIN") {
    return { erreur: "Seul l'Administrateur peut clôturer un départ." };
  }

  const analyse = schemaCloture.safeParse({
    demandeDepartId: formData.get("demandeDepartId"),
    entretienSortie: formData.get("entretienSortie") || undefined,
  });
  if (!analyse.success) {
    return { erreur: analyse.error.issues[0]?.message ?? "Formulaire invalide." };
  }
  const { demandeDepartId, entretienSortie } = analyse.data;

  const resultat = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [demande] = await tx.select().from(demandeDepart).where(eq(demandeDepart.id, demandeDepartId));
    if (!demande) return { erreur: "Demande de départ introuvable." };
    if (demande.statut !== "APPROUVEE") return { erreur: "Seule une demande approuvée peut être clôturée." };

    const clearances = await tx.select({ complete: clearanceDepart.complete }).from(clearanceDepart).where(eq(clearanceDepart.demandeDepartId, demandeDepartId));
    if (clearances.some((c) => !c.complete)) {
      return { erreur: "Toutes les clôtures doivent être validées (ou supprimées) avant de clôturer le départ." };
    }

    const [leDossier] = await tx.select({ utilisateurId: dossierRH.utilisateurId }).from(dossierRH).where(eq(dossierRH.id, demande.dossierRHId));
    if (!leDossier) return { erreur: "Dossier RH introuvable." };

    await tx.update(demandeDepart).set({ statut: "CLOTUREE", entretienSortie }).where(eq(demandeDepart.id, demandeDepartId));
    await tx.update(dossierRH).set({ dateDepart: demande.dateDepartConfirmee ?? demande.dateDepartSouhaitee }).where(eq(dossierRH.id, demande.dossierRHId));
    await tx.update(utilisateur).set({ statut: "DESACTIVE" }).where(eq(utilisateur.id, leDossier.utilisateurId));

    return { dossierRHId: demande.dossierRHId, utilisateurId: leDossier.utilisateurId };
  });

  if ("erreur" in resultat && resultat.erreur) return { erreur: resultat.erreur };
  const { dossierRHId, utilisateurId } = resultat as { dossierRHId: string; utilisateurId: string };

  // Hors de la transaction avecEntreprise() : la table session n'est pas
  // soumise à la RLS stricte (même exception que utilisateur/compte, voir
  // CLAUDE.md) et db.delete() ici évite de mélanger le nettoyage de session
  // avec la logique métier ci-dessus.
  await db.delete(session).where(eq(session.userId, utilisateurId));

  revalidatePath(cheminDossier(dossierRHId));
  return null;
}
