"use server";

import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, pageAtterrissage, prospect, utilisateur } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { disponibleAddon } from "@/lib/plans";

const schemaPage = z.object({
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9-]+$/, "Le slug ne peut contenir que des lettres minuscules, chiffres et tirets."),
  titre: z.string().trim().min(2, "Le titre est requis."),
  texte: z.string().trim().min(1, "Le texte est requis."),
  imageUrl: z.url("URL d'image invalide.").optional().or(z.literal("")),
  texteBouton: z.string().trim().min(1).default("Nous contacter"),
});

export type EtatPageAtterrissage = { erreur?: string } | null;

export async function creerPageAtterrissage(_etat: EtatPageAtterrissage, formData: FormData): Promise<EtatPageAtterrissage> {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte.role, "MARKETING", "CREER")) {
    return { erreur: "Vous n'avez pas le droit de créer une page d'atterrissage." };
  }

  const analyse = schemaPage.safeParse({
    slug: formData.get("slug"),
    titre: formData.get("titre"),
    texte: formData.get("texte"),
    imageUrl: formData.get("imageUrl") || "",
    texteBouton: formData.get("texteBouton") || "Nous contacter",
  });
  if (!analyse.success) {
    return { erreur: analyse.error.issues[0]?.message ?? "Formulaire invalide." };
  }
  const { slug, titre, texte, imageUrl, texteBouton } = analyse.data;

  const resultat = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [monEntreprise] = await tx.select().from(entreprise).where(eq(entreprise.id, utilisateurConnecte.entrepriseId));
    if (!(await disponibleAddon(tx, monEntreprise, "MARKETING"))) {
      return { erreur: "Le module Marketing n'est pas activé pour votre entreprise." };
    }

    try {
      await tx.insert(pageAtterrissage).values({ entrepriseId: utilisateurConnecte.entrepriseId, slug, titre, texte, imageUrl: imageUrl || undefined, texteBouton });
    } catch {
      return { erreur: "Ce slug est déjà utilisé — choisissez-en un autre." };
    }

    return null;
  });

  if (resultat?.erreur) return resultat;

  revalidatePath("/app/marketing");
  return null;
}

export async function publierPageAtterrissage(id: string, publiee: boolean) {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte.role, "MARKETING", "MODIFIER")) return;

  await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) => tx.update(pageAtterrissage).set({ publiee }).where(eq(pageAtterrissage.id, id)));

  revalidatePath("/app/marketing");
}

const schemaContact = z.object({
  slug: z.string(),
  nom: z.string().trim().min(2, "Le nom est trop court."),
  telephone: z.string().trim().min(6, "Numéro de téléphone invalide."),
  email: z.email().optional().or(z.literal("")),
});

export type EtatContactPublic = { erreur?: string; succes?: boolean } | null;

/**
 * Route publique, sans session — docs/palier-6-*, section 3 : "la soumission
 * du formulaire de contact... crée directement un Prospect avec statut
 * NOUVEAU, exactement comme s'il avait été saisi à la main dans le CRM."
 * entrepriseId connu et validé côté serveur (relu depuis la page trouvée par
 * slug, jamais envoyé par le client) avant d'ouvrir la transaction
 * avecEntreprise() — aucune modification de politique RLS nécessaire sur
 * `prospect` pour ce flux anonyme.
 */
export async function soumettreFormulaireContact(_etat: EtatContactPublic, formData: FormData): Promise<EtatContactPublic> {
  const analyse = schemaContact.safeParse({
    slug: formData.get("slug"),
    nom: formData.get("nom"),
    telephone: formData.get("telephone"),
    email: formData.get("email") || "",
  });
  if (!analyse.success) {
    return { erreur: analyse.error.issues[0]?.message ?? "Formulaire invalide." };
  }
  const { slug, nom, telephone, email } = analyse.data;

  const [page] = await db.select({ id: pageAtterrissage.id, entrepriseId: pageAtterrissage.entrepriseId }).from(pageAtterrissage).where(eq(pageAtterrissage.slug, slug));
  if (!page) return { erreur: "Page introuvable." };

  await avecEntreprise(page.entrepriseId, async (tx) => {
    // assigneAId référence obligatoirement un utilisateur réel — un lead
    // capté sans préférence particulière est assigné par défaut au premier
    // Administrateur de l'entreprise, à réassigner ensuite depuis le CRM.
    const [unAdmin] = await tx
      .select({ id: utilisateur.id })
      .from(utilisateur)
      .where(and(eq(utilisateur.entrepriseId, page.entrepriseId), eq(utilisateur.role, "ADMIN")))
      .orderBy(utilisateur.creeLe)
      .limit(1);
    if (!unAdmin) return;

    await tx.insert(prospect).values({
      entrepriseId: page.entrepriseId,
      nom,
      telephone,
      email: email || undefined,
      statut: "NOUVEAU",
      notes: `Reçu via la page d'atterrissage "${slug}".`,
      assigneAId: unAdmin.id,
    });
  });

  return { succes: true };
}
