"use server";

import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { avecEntreprise } from "@/db/client";
import { entreprise, politiqueConge, politiqueCongePalier, dossierRH } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { disponible } from "@/lib/plans";
import { calculerDroitAnnuelConge } from "@/lib/rh/politique-conge";

const CHEMIN = "/app/rh/politiques-conges";

export type EtatPolitiqueConge = { erreur?: string } | null;

const schemaPolitique = z.object({
  nom: z.string().trim().min(1, "Le nom est requis."),
  type: z.enum(["FIXE", "ANCIENNETE"]),
  joursBaseParAn: z.coerce.number().int().min(0, "Le nombre de jours doit être positif ou nul."),
});

/**
 * Politiques de congés (échange du 2026-09-08) — décision structurante de
 * l'organisation, réservée à l'Administrateur comme modifierDossierRH()
 * (src/lib/actions/rh.ts), pas seulement peut(role,"RH","MODIFIER") qui
 * inclut aussi un Manager de portée EQUIPE.
 */
export async function creerPolitiqueConge(_etat: EtatPolitiqueConge, formData: FormData): Promise<EtatPolitiqueConge> {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (utilisateurConnecte.role !== "ADMIN") {
    return { erreur: "Seul l'Administrateur peut créer une politique de congé." };
  }

  const analyse = schemaPolitique.safeParse({
    nom: formData.get("nom"),
    type: formData.get("type"),
    joursBaseParAn: formData.get("joursBaseParAn"),
  });
  if (!analyse.success) {
    return { erreur: analyse.error.issues[0]?.message ?? "Formulaire invalide." };
  }
  const { nom, type, joursBaseParAn } = analyse.data;

  const resultat = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [monEntreprise] = await tx.select().from(entreprise).where(eq(entreprise.id, utilisateurConnecte.entrepriseId));
    if (!disponible(monEntreprise, "RH")) return { erreur: "Les Ressources Humaines sont disponibles à partir du forfait Business." };

    await tx.insert(politiqueConge).values({
      entrepriseId: utilisateurConnecte.entrepriseId,
      nom,
      type,
      joursBaseParAn,
      creeParId: utilisateurConnecte.utilisateurId,
    });
    return null;
  });

  if (resultat?.erreur) return resultat;

  revalidatePath(CHEMIN);
  return null;
}

const schemaPalier = z.object({
  politiqueCongeId: z.string().min(1),
  anneesAncienneteMin: z.coerce.number().int().min(0, "Le nombre d'années doit être positif ou nul."),
  joursSupplementaires: z.coerce.number().int().min(1, "Le nombre de jours supplémentaires doit être positif."),
});

export async function ajouterPalierAnciennete(_etat: EtatPolitiqueConge, formData: FormData): Promise<EtatPolitiqueConge> {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (utilisateurConnecte.role !== "ADMIN") {
    return { erreur: "Seul l'Administrateur peut modifier une politique de congé." };
  }

  const analyse = schemaPalier.safeParse({
    politiqueCongeId: formData.get("politiqueCongeId"),
    anneesAncienneteMin: formData.get("anneesAncienneteMin"),
    joursSupplementaires: formData.get("joursSupplementaires"),
  });
  if (!analyse.success) {
    return { erreur: analyse.error.issues[0]?.message ?? "Formulaire invalide." };
  }
  const { politiqueCongeId, anneesAncienneteMin, joursSupplementaires } = analyse.data;

  const resultat = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [laPolitique] = await tx.select({ type: politiqueConge.type }).from(politiqueConge).where(eq(politiqueConge.id, politiqueCongeId));
    if (!laPolitique) return { erreur: "Politique de congé introuvable." };
    if (laPolitique.type !== "ANCIENNETE") return { erreur: "Seule une politique par ancienneté peut avoir des paliers." };

    await tx.insert(politiqueCongePalier).values({
      entrepriseId: utilisateurConnecte.entrepriseId,
      politiqueCongeId,
      anneesAncienneteMin,
      joursSupplementaires,
    });
    return null;
  });

  if (resultat?.erreur) return resultat;

  revalidatePath(CHEMIN);
  return null;
}

export async function supprimerPalier(palierId: string) {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (utilisateurConnecte.role !== "ADMIN") return;

  await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) => tx.delete(politiqueCongePalier).where(eq(politiqueCongePalier.id, palierId)));

  revalidatePath(CHEMIN);
}

/**
 * Désactive plutôt que supprime — une politique déjà assignée à des
 * employés doit rester lisible dans leur historique ; onDelete "set null"
 * sur dossierRH.politiqueCongeId permettrait la suppression réelle, mais
 * désactiver (actif=false, exclue des listes de sélection) est plus sûr et
 * réversible.
 */
export async function desactiverPolitiqueConge(politiqueCongeId: string) {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (utilisateurConnecte.role !== "ADMIN") return;

  await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) => tx.update(politiqueConge).set({ actif: false }).where(eq(politiqueConge.id, politiqueCongeId)));

  revalidatePath(CHEMIN);
}

const schemaAssignation = z.object({
  dossierRHId: z.string().min(1),
  politiqueCongeId: z.string().optional(),
});

/**
 * Assignation seule (formulaire dédié sur la fiche dossier RH) — distincte
 * de modifierDossierRH() (src/lib/actions/rh.ts) pour ne pas mélanger deux
 * décisions différentes dans un seul formulaire.
 */
export async function assignerPolitiqueConge(_etat: EtatPolitiqueConge, formData: FormData): Promise<EtatPolitiqueConge> {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (utilisateurConnecte.role !== "ADMIN") {
    return { erreur: "Seul l'Administrateur peut assigner une politique de congé." };
  }

  const analyse = schemaAssignation.safeParse({
    dossierRHId: formData.get("dossierRHId"),
    politiqueCongeId: formData.get("politiqueCongeId") || undefined,
  });
  if (!analyse.success) {
    return { erreur: analyse.error.issues[0]?.message ?? "Formulaire invalide." };
  }
  const { dossierRHId, politiqueCongeId } = analyse.data;

  await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) =>
    tx.update(dossierRH).set({ politiqueCongeId: politiqueCongeId ?? null }).where(eq(dossierRH.id, dossierRHId))
  );

  revalidatePath(`/app/rh/${dossierRHId}`);
  return null;
}

/**
 * Créditation manuelle et explicite (échange du 2026-09-08 — préférée à une
 * tâche planifiée pour cette tranche) : additionne le droit annuel calculé
 * au solde existant, ne l'écrase jamais — un reliquat non pris l'année
 * précédente reste acquis, même logique additive que
 * approuverDemandeConge() (src/lib/rh/conges.ts).
 */
export async function crediterSoldeSelonPolitique(dossierRHId: string) {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (utilisateurConnecte.role !== "ADMIN") return;

  await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [ligne] = await tx
      .select({
        dateEmbauche: dossierRH.dateEmbauche,
        politiqueCongeId: dossierRH.politiqueCongeId,
        politiqueType: politiqueConge.type,
        politiqueJoursBase: politiqueConge.joursBaseParAn,
      })
      .from(dossierRH)
      .leftJoin(politiqueConge, eq(dossierRH.politiqueCongeId, politiqueConge.id))
      .where(eq(dossierRH.id, dossierRHId));
    if (!ligne || !ligne.politiqueCongeId || !ligne.politiqueType) return;

    const paliers =
      ligne.politiqueType === "ANCIENNETE"
        ? await tx
            .select({ anneesAncienneteMin: politiqueCongePalier.anneesAncienneteMin, joursSupplementaires: politiqueCongePalier.joursSupplementaires })
            .from(politiqueCongePalier)
            .where(eq(politiqueCongePalier.politiqueCongeId, ligne.politiqueCongeId))
        : [];

    const droitAnnuel = calculerDroitAnnuelConge({ type: ligne.politiqueType, joursBaseParAn: ligne.politiqueJoursBase! }, paliers, ligne.dateEmbauche, new Date());

    await tx.update(dossierRH).set({ soldeConges: sql`${dossierRH.soldeConges} + ${droitAnnuel}` }).where(eq(dossierRH.id, dossierRHId));
  });

  revalidatePath(`/app/rh/${dossierRHId}`);
}
