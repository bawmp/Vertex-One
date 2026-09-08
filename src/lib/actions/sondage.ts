"use server";

import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { avecEntreprise } from "@/db/client";
import { entreprise, sondage, sondageQuestion, sondageReponse, sondageParticipation } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { disponible } from "@/lib/plans";

const CHEMIN = "/app/rh/sondages";

export type EtatSondage = { erreur?: string } | null;

const schemaQuestion = z.object({
  libelle: z.string().trim().min(1, "Chaque question doit avoir un libellé."),
  type: z.enum(["NPS", "ETOILES", "TEXTE"]),
});

const schemaSondage = z.object({
  titre: z.string().trim().min(1, "Le titre est requis."),
  questions: z.array(schemaQuestion).min(1, "Un sondage doit avoir au moins une question."),
});

/**
 * Sondages d'engagement (échange du 2026-09-08) — décision structurante,
 * réservée à l'Administrateur (même niveau que creerPolitiqueConge()), pas
 * seulement peut(role,"RH","MODIFIER") qui inclut aussi un Manager de
 * portée EQUIPE — un sondage est par nature à l'échelle de l'entreprise.
 */
export async function creerSondage(_etat: EtatSondage, formData: FormData): Promise<EtatSondage> {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (utilisateurConnecte.role !== "ADMIN") {
    return { erreur: "Seul l'Administrateur peut créer un sondage." };
  }

  const libelles = formData.getAll("libelle").map(String);
  const types = formData.getAll("type").map(String);
  const questionsBrutes = libelles.map((libelle, i) => ({ libelle, type: types[i] ?? "" }));

  const analyse = schemaSondage.safeParse({ titre: formData.get("titre"), questions: questionsBrutes });
  if (!analyse.success) {
    return { erreur: analyse.error.issues[0]?.message ?? "Formulaire invalide." };
  }
  const { titre, questions } = analyse.data;

  const resultat = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [monEntreprise] = await tx.select().from(entreprise).where(eq(entreprise.id, utilisateurConnecte.entrepriseId));
    if (!disponible(monEntreprise, "RH")) return { erreur: "Les Ressources Humaines sont disponibles à partir du forfait Business." };

    const [leSondage] = await tx.insert(sondage).values({ entrepriseId: utilisateurConnecte.entrepriseId, titre, creeParId: utilisateurConnecte.utilisateurId }).returning({ id: sondage.id });

    await tx.insert(sondageQuestion).values(
      questions.map((q, i) => ({ entrepriseId: utilisateurConnecte.entrepriseId, sondageId: leSondage.id, ordre: i, libelle: q.libelle, type: q.type }))
    );

    return null;
  });

  if (resultat?.erreur) return resultat;

  revalidatePath(CHEMIN);
  return null;
}

export async function ouvrirSondage(sondageId: string) {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (utilisateurConnecte.role !== "ADMIN") return;

  await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) =>
    tx.update(sondage).set({ statut: "OUVERT" }).where(and(eq(sondage.id, sondageId), eq(sondage.statut, "BROUILLON")))
  );

  revalidatePath(CHEMIN);
  revalidatePath(`${CHEMIN}/${sondageId}`);
}

export async function fermerSondage(sondageId: string) {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (utilisateurConnecte.role !== "ADMIN") return;

  await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) =>
    tx.update(sondage).set({ statut: "FERME" }).where(and(eq(sondage.id, sondageId), eq(sondage.statut, "OUVERT")))
  );

  revalidatePath(CHEMIN);
  revalidatePath(`${CHEMIN}/${sondageId}`);
}

/**
 * Ne supprime qu'un sondage encore BROUILLON — aucune réponse n'a pu être
 * déposée avant l'ouverture, donc rien à protéger ; un sondage OUVERT ou
 * FERME garde son historique, jamais supprimable (même esprit qu'une
 * facture, CLAUDE.md — l'intégrité des données d'engagement ne s'efface
 * pas après coup).
 */
export async function supprimerSondage(sondageId: string) {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (utilisateurConnecte.role !== "ADMIN") return;

  await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) =>
    tx.delete(sondage).where(and(eq(sondage.id, sondageId), eq(sondage.statut, "BROUILLON")))
  );

  revalidatePath(CHEMIN);
}

/**
 * Réponse anonyme : sondageReponse ne porte jamais utilisateurConnecte.utilisateurId
 * (voir schema.ts) — seule sondageParticipation, une table séparée sans
 * lien vers les réponses, empêche une double soumission.
 */
export async function repondreSondage(sondageId: string, _etat: EtatSondage, formData: FormData): Promise<EtatSondage> {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte.role, "RH", "CREER")) {
    return { erreur: "Vous n'avez pas le droit de répondre à un sondage." };
  }

  const resultat = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [monEntreprise] = await tx.select().from(entreprise).where(eq(entreprise.id, utilisateurConnecte.entrepriseId));
    if (!disponible(monEntreprise, "RH")) return { erreur: "Les Ressources Humaines sont disponibles à partir du forfait Business." };

    const [leSondage] = await tx.select({ statut: sondage.statut }).from(sondage).where(eq(sondage.id, sondageId));
    if (!leSondage || leSondage.statut !== "OUVERT") return { erreur: "Ce sondage n'est plus ouvert aux réponses." };

    const [dejaRepondu] = await tx
      .select({ id: sondageParticipation.id })
      .from(sondageParticipation)
      .where(and(eq(sondageParticipation.sondageId, sondageId), eq(sondageParticipation.utilisateurId, utilisateurConnecte.utilisateurId)));
    if (dejaRepondu) return { erreur: "Vous avez déjà répondu à ce sondage." };

    const questions = await tx.select({ id: sondageQuestion.id }).from(sondageQuestion).where(eq(sondageQuestion.sondageId, sondageId));
    const reponses = questions
      .map((q) => ({ questionId: q.id, valeur: formData.get(`question-${q.id}`) }))
      .filter((r): r is { questionId: string; valeur: FormDataEntryValue } => r.valeur != null && String(r.valeur).trim() !== "");
    if (reponses.length === 0) return { erreur: "Répondez à au moins une question." };

    await tx.insert(sondageReponse).values(
      reponses.map((r) => ({ entrepriseId: utilisateurConnecte.entrepriseId, sondageId, questionId: r.questionId, valeur: String(r.valeur).trim() }))
    );
    await tx.insert(sondageParticipation).values({ entrepriseId: utilisateurConnecte.entrepriseId, sondageId, utilisateurId: utilisateurConnecte.utilisateurId });

    return null;
  });

  if (resultat?.erreur) return resultat;

  revalidatePath(`${CHEMIN}/${sondageId}`);
  return null;
}
