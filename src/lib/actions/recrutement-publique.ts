"use server";

import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, parametreRecrutement, posteOuvert, candidature } from "@/db/schema";
import { disponibleAddon } from "@/lib/plans";
import { televerserDocument } from "@/lib/documents/stockage";
import { cvValide } from "@/lib/recrutement/validation";

/**
 * Actions publiques, sans session — même patron exact que
 * src/lib/actions/reservations-publiques.ts : entrepriseId toujours
 * re-résolu côté serveur depuis le slug, jamais reçu du client.
 */

export type ParametresRecrutementPublics = { entrepriseId: string; titre: string; texte: string | null };

export async function resoudreParametresRecrutementPublics(slug: string): Promise<ParametresRecrutementPublics | null> {
  const [params] = await db
    .select({ entrepriseId: parametreRecrutement.entrepriseId, titre: parametreRecrutement.titre, texte: parametreRecrutement.texte })
    .from(parametreRecrutement)
    .where(and(eq(parametreRecrutement.slug, slug), eq(parametreRecrutement.publie, true)));
  if (!params) return null;

  const actif = await avecEntreprise(params.entrepriseId, async (tx) => {
    const [monEntreprise] = await tx.select({ id: entreprise.id, statutAbonnement: entreprise.statutAbonnement }).from(entreprise).where(eq(entreprise.id, params.entrepriseId));
    if (!monEntreprise) return false;
    return disponibleAddon(tx, monEntreprise, "RECRUTEMENT");
  });
  if (!actif) return null;

  return params;
}

export type PosteOuvertPublic = { id: string; titre: string; description: string | null; lieu: string | null };

export async function obtenirPostesOuverts(slug: string): Promise<PosteOuvertPublic[]> {
  const params = await resoudreParametresRecrutementPublics(slug);
  if (!params) return [];

  return avecEntreprise(params.entrepriseId, (tx) =>
    tx
      .select({ id: posteOuvert.id, titre: posteOuvert.titre, description: posteOuvert.description, lieu: posteOuvert.lieu })
      .from(posteOuvert)
      .where(and(eq(posteOuvert.entrepriseId, params.entrepriseId), eq(posteOuvert.actif, true)))
  );
}

export async function obtenirPosteOuvert(slug: string, posteId: string): Promise<PosteOuvertPublic | null> {
  const params = await resoudreParametresRecrutementPublics(slug);
  if (!params) return null;

  const [poste] = await avecEntreprise(params.entrepriseId, (tx) =>
    tx
      .select({ id: posteOuvert.id, titre: posteOuvert.titre, description: posteOuvert.description, lieu: posteOuvert.lieu })
      .from(posteOuvert)
      .where(and(eq(posteOuvert.id, posteId), eq(posteOuvert.entrepriseId, params.entrepriseId), eq(posteOuvert.actif, true)))
  );
  return poste ?? null;
}

const schemaCandidature = z.object({
  slug: z.string(),
  posteId: z.string(),
  nom: z.string().trim().min(2, "Le nom est trop court."),
  telephone: z.string().trim().min(6, "Numéro de téléphone invalide."),
  email: z.email().optional().or(z.literal("")),
  message: z.string().trim().optional(),
});

export type EtatCandidature = { erreur?: string; succes?: boolean } | null;

export async function soumettreCandidature(_etat: EtatCandidature, formData: FormData): Promise<EtatCandidature> {
  const analyse = schemaCandidature.safeParse({
    slug: formData.get("slug"),
    posteId: formData.get("posteId"),
    nom: formData.get("nom"),
    telephone: formData.get("telephone"),
    email: formData.get("email") || "",
    message: formData.get("message") || "",
  });
  if (!analyse.success) {
    return { erreur: analyse.error.issues[0]?.message ?? "Formulaire invalide." };
  }
  const { slug, posteId, nom, telephone, email, message } = analyse.data;

  const cv = formData.get("cv");
  if (!(cv instanceof File)) {
    return { erreur: "Sélectionnez un CV." };
  }
  const erreurCv = cvValide(cv);
  if (erreurCv) return { erreur: erreurCv };

  const params = await resoudreParametresRecrutementPublics(slug);
  if (!params) return { erreur: "Cette offre n'est plus disponible." };

  const poste = await obtenirPosteOuvert(slug, posteId);
  if (!poste) return { erreur: "Ce poste n'est plus disponible." };

  const contenu = Buffer.from(await cv.arrayBuffer());
  const { televerse, cleStockage, erreur } = await televerserDocument({
    entrepriseId: params.entrepriseId,
    nomFichier: cv.name,
    typeMime: cv.type,
    contenu,
  });
  if (!televerse) return { erreur: erreur ?? "Le téléversement du CV a échoué, réessayez plus tard." };

  await avecEntreprise(params.entrepriseId, (tx) =>
    tx.insert(candidature).values({
      entrepriseId: params.entrepriseId,
      posteId,
      nom,
      telephone,
      email: email || undefined,
      message: message || undefined,
      cvCleStockage: cleStockage,
      cvNomFichier: cv.name,
      cvTypeMime: cv.type,
      cvTailleOctets: cv.size,
    })
  );

  return { succes: true };
}
