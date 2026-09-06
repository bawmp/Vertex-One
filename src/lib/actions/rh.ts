"use server";

import { z } from "zod";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { avecEntreprise } from "@/db/client";
import { entreprise, dossierRH, demandeConge, evaluation } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut, portee } from "@/lib/permissions";
import { disponible } from "@/lib/plans";
import { idsVisibles } from "@/lib/portee";
import { approuverDemandeConge, refuserDemandeConge } from "@/lib/rh/conges";
import { pointerArrivee, pointerDepart } from "@/lib/rh/pointage";

const schemaDemandeConge = z.object({
  type: z.enum(["CONGE_PAYE", "MALADIE", "SANS_SOLDE", "AUTRE"]),
  dateDebut: z.string().min(1, "La date de début est requise."),
  dateFin: z.string().min(1, "La date de fin est requise."),
  nombreJours: z.coerce.number().positive("Le nombre de jours doit être positif."),
  motif: z.string().trim().optional(),
});

export type EtatDemandeConge = { erreur?: string } | null;

/**
 * Toujours pour son propre Dossier RH, jamais un dossierRHId envoyé par le
 * client — un Employé ne demande que son propre congé (docs/palier-5-*,
 * section 9, étape 2).
 */
export async function creerDemandeConge(_etat: EtatDemandeConge, formData: FormData): Promise<EtatDemandeConge> {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte.role, "RH", "CREER")) {
    return { erreur: "Vous n'avez pas le droit de demander un congé." };
  }

  const analyse = schemaDemandeConge.safeParse({
    type: formData.get("type"),
    dateDebut: formData.get("dateDebut"),
    dateFin: formData.get("dateFin"),
    nombreJours: formData.get("nombreJours"),
    motif: formData.get("motif") || undefined,
  });
  if (!analyse.success) {
    return { erreur: analyse.error.issues[0]?.message ?? "Formulaire invalide." };
  }
  const { type, dateDebut, dateFin, nombreJours, motif } = analyse.data;

  const resultat = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [monEntreprise] = await tx.select().from(entreprise).where(eq(entreprise.id, utilisateurConnecte.entrepriseId));
    if (!disponible(monEntreprise, "RH")) return { erreur: "Les Ressources Humaines sont disponibles à partir du forfait Business." };

    const [monDossier] = await tx.select({ id: dossierRH.id }).from(dossierRH).where(eq(dossierRH.utilisateurId, utilisateurConnecte.utilisateurId));
    if (!monDossier) return { erreur: "Aucun dossier RH associé à votre compte." };

    await tx.insert(demandeConge).values({
      entrepriseId: utilisateurConnecte.entrepriseId,
      dossierRHId: monDossier.id,
      type,
      dateDebut: new Date(dateDebut),
      dateFin: new Date(dateFin),
      nombreJours,
      motif,
    });

    return null;
  });

  if (resultat?.erreur) return resultat;

  revalidatePath("/app/rh");
  return null;
}

/**
 * L'approbation vérifie que le dossier concerné est bien dans la portée de
 * qui approuve (EQUIPE pour un Manager, TOUT pour un Administrateur) — un
 * Manager ne peut pas approuver le congé d'un employé hors de son équipe
 * même en devinant l'id de la demande.
 */
export async function traiterDemandeConge(demandeId: string, decision: "approuver" | "refuser") {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte.role, "RH", "MODIFIER")) return;

  await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [demande] = await tx.select().from(demandeConge).where(eq(demandeConge.id, demandeId));
    if (!demande) return;

    const [leDossier] = await tx.select({ utilisateurId: dossierRH.utilisateurId }).from(dossierRH).where(eq(dossierRH.id, demande.dossierRHId));
    if (!leDossier) return;

    const ids = await idsVisibles(tx, utilisateurConnecte, "RH");
    if (ids !== "TOUT" && !ids.includes(leDossier.utilisateurId)) return;

    if (decision === "approuver") {
      await approuverDemandeConge(tx, demandeId, utilisateurConnecte.utilisateurId);
    } else {
      await refuserDemandeConge(tx, demandeId, utilisateurConnecte.utilisateurId);
    }
  });

  revalidatePath("/app/rh");
}

/**
 * Toujours pour son propre Dossier RH — voir src/lib/rh/pointage.ts pour la
 * mécanique "une ligne par jour".
 */
export async function pointerArriveeAction() {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte.role, "RH", "CREER")) return;

  await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [monDossier] = await tx.select({ id: dossierRH.id }).from(dossierRH).where(eq(dossierRH.utilisateurId, utilisateurConnecte.utilisateurId));
    if (!monDossier) return;
    await pointerArrivee(tx, utilisateurConnecte.entrepriseId, monDossier.id);
  });

  revalidatePath("/app/rh");
}

export async function pointerDepartAction() {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte.role, "RH", "CREER")) return;

  await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [monDossier] = await tx.select({ id: dossierRH.id }).from(dossierRH).where(eq(dossierRH.utilisateurId, utilisateurConnecte.utilisateurId));
    if (!monDossier) return;
    await pointerDepart(tx, monDossier.id);
  });

  revalidatePath("/app/rh");
}

const schemaModificationDossier = z.object({
  dossierRHId: z.string(),
  poste: z.string().trim().min(1, "Le poste est requis."),
  typeContrat: z.enum(["CDI", "CDD", "STAGE", "PRESTATAIRE"]),
  dateEmbauche: z.string().min(1),
  dateFinContrat: z.string().optional(),
  salaireBase: z.string().optional(),
  nombrePersonnesACharge: z.coerce.number().int().min(0).default(0),
});

export type EtatDossierRH = { erreur?: string } | null;

/**
 * Le salaire n'est jamais rempli automatiquement (règle métier, CLAUDE.md) —
 * cette action est le seul endroit où il peut être saisi, et uniquement par
 * un Administrateur (portee(ADMIN, "RH") === "TOUT", mais surtout actions
 * incluant MODIFIER réservées à ADMIN/MANAGER ; le salaire précis exige en
 * plus peutVoirSalaire() côté page pour même afficher le champ).
 */
export async function modifierDossierRH(_etat: EtatDossierRH, formData: FormData): Promise<EtatDossierRH> {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (utilisateurConnecte.role !== "ADMIN") {
    return { erreur: "Seul l'Administrateur peut modifier un dossier RH." };
  }

  const analyse = schemaModificationDossier.safeParse({
    dossierRHId: formData.get("dossierRHId"),
    poste: formData.get("poste"),
    typeContrat: formData.get("typeContrat"),
    dateEmbauche: formData.get("dateEmbauche"),
    dateFinContrat: formData.get("dateFinContrat") || undefined,
    salaireBase: formData.get("salaireBase") || undefined,
    nombrePersonnesACharge: formData.get("nombrePersonnesACharge") || 0,
  });
  if (!analyse.success) {
    return { erreur: analyse.error.issues[0]?.message ?? "Formulaire invalide." };
  }
  const { dossierRHId, poste, typeContrat, dateEmbauche, dateFinContrat, salaireBase, nombrePersonnesACharge } = analyse.data;

  await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) =>
    tx
      .update(dossierRH)
      .set({
        poste,
        typeContrat,
        dateEmbauche: new Date(dateEmbauche),
        dateFinContrat: dateFinContrat ? new Date(dateFinContrat) : null,
        salaireBase: salaireBase ? Math.round(Number(salaireBase)) : null,
        nombrePersonnesACharge,
      })
      .where(eq(dossierRH.id, dossierRHId))
  );

  revalidatePath(`/app/rh/${dossierRHId}`);
  return null;
}

const schemaEvaluation = z.object({
  dossierRHId: z.string(),
  periode: z.string().trim().min(1, "La période est requise."),
  commentaire: z.string().trim().optional(),
});

export type EtatEvaluation = { erreur?: string } | null;

export async function creerEvaluation(_etat: EtatEvaluation, formData: FormData): Promise<EtatEvaluation> {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte.role, "RH", "MODIFIER")) {
    return { erreur: "Vous n'avez pas le droit d'ajouter une évaluation." };
  }

  const analyse = schemaEvaluation.safeParse({
    dossierRHId: formData.get("dossierRHId"),
    periode: formData.get("periode"),
    commentaire: formData.get("commentaire") || undefined,
  });
  if (!analyse.success) {
    return { erreur: analyse.error.issues[0]?.message ?? "Formulaire invalide." };
  }
  const { dossierRHId, periode, commentaire } = analyse.data;

  const resultat = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [leDossier] = await tx.select({ utilisateurId: dossierRH.utilisateurId }).from(dossierRH).where(eq(dossierRH.id, dossierRHId));
    if (!leDossier) return { erreur: "Dossier RH introuvable." };

    if (portee(utilisateurConnecte.role, "RH") !== "TOUT") {
      const ids = await idsVisibles(tx, utilisateurConnecte, "RH");
      if (ids !== "TOUT" && !ids.includes(leDossier.utilisateurId)) {
        return { erreur: "Ce dossier n'est pas dans votre équipe." };
      }
    }

    await tx.insert(evaluation).values({
      entrepriseId: utilisateurConnecte.entrepriseId,
      dossierRHId,
      evaluateurId: utilisateurConnecte.utilisateurId,
      periode,
      commentaire,
    });

    return null;
  });

  if (resultat?.erreur) return resultat;

  revalidatePath(`/app/rh/${dossierRHId}`);
  return null;
}
