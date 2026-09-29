"use server";

import { z } from "zod";
import { eq, and, asc } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { avecEntreprise, type TransactionDrizzle } from "@/db/client";
import { contactChampPersonnalise, contactChampValeur } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { getT } from "@/lib/i18n/langue";
import { m } from "@/lib/i18n/catalogue";
import { TYPES_CHAMP_CONTACT, TYPES_AVEC_OPTIONS_CHAMP_CONTACT as TYPES_AVEC_OPTIONS } from "@/lib/contact-champs-personnalises-types";

const CHEMIN = "/app/parametres/champs-contact";

function optionsDepuisTexte(texte: string | undefined): string[] | undefined {
  if (!texte) return undefined;
  const lignes = texte
    .split("\n")
    .map((o) => o.trim())
    .filter(Boolean);
  return lignes.length > 0 ? lignes : undefined;
}

export type EtatChampPersonnaliseContact = { erreur?: string } | null;

const schemaCreation = z.object({
  libelle: z.string().trim().min(1, m("Le libellé est requis.")),
  type: z.enum(TYPES_CHAMP_CONTACT),
  obligatoire: z.coerce.boolean(),
  options: z.string().trim().optional(),
});

/** Réservé à l'Administrateur (module PARAMETRES) — voir CLAUDE.md, section modules indépendants. */
export async function creerChampPersonnaliseContact(_etat: EtatChampPersonnaliseContact, formData: FormData): Promise<EtatChampPersonnaliseContact> {
  const t = await getT();
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte, "PARAMETRES", "CREER")) {
    return { erreur: t("Seul l'Administrateur peut créer un champ personnalisé.") };
  }

  const analyse = schemaCreation.safeParse({
    libelle: formData.get("libelle"),
    type: formData.get("type"),
    obligatoire: formData.get("obligatoire") === "on",
    options: formData.get("options") || undefined,
  });
  if (!analyse.success) {
    return { erreur: t(analyse.error.issues[0]?.message ?? m("Formulaire invalide.")) };
  }
  const { libelle, type, obligatoire } = analyse.data;

  if (TYPES_AVEC_OPTIONS.has(type) && !optionsDepuisTexte(analyse.data.options)) {
    return { erreur: t("Indiquez au moins une option pour une liste déroulante.") };
  }
  const options = TYPES_AVEC_OPTIONS.has(type) ? optionsDepuisTexte(analyse.data.options) : undefined;

  await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const existants = await tx
      .select({ ordre: contactChampPersonnalise.ordre })
      .from(contactChampPersonnalise)
      .where(eq(contactChampPersonnalise.entrepriseId, utilisateurConnecte.entrepriseId));
    const prochainOrdre = existants.length > 0 ? Math.max(...existants.map((e) => e.ordre)) + 1 : 0;
    await tx.insert(contactChampPersonnalise).values({
      entrepriseId: utilisateurConnecte.entrepriseId,
      libelle,
      type,
      obligatoire,
      options,
      ordre: prochainOrdre,
    });
  });

  revalidatePath(CHEMIN);
  return null;
}

const schemaModification = z.object({
  champId: z.string(),
  libelle: z.string().trim().min(1, m("Le libellé est requis.")),
  obligatoire: z.coerce.boolean(),
  options: z.string().trim().optional(),
});

/**
 * Modifie le libellé, le caractère obligatoire et les options d'un champ. Le type ne
 * change jamais (les valeurs déjà enregistrées en dépendent) : il est relu en base,
 * jamais pris dans la requête — même patron que modifierChamp() de One Form.
 */
export async function modifierChampPersonnaliseContact(_etat: EtatChampPersonnaliseContact, formData: FormData): Promise<EtatChampPersonnaliseContact> {
  const t = await getT();
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte, "PARAMETRES", "MODIFIER")) {
    return { erreur: t("Seul l'Administrateur peut modifier un champ personnalisé.") };
  }

  const analyse = schemaModification.safeParse({
    champId: formData.get("champId"),
    libelle: formData.get("libelle"),
    obligatoire: formData.get("obligatoire") === "on",
    options: formData.get("options") || undefined,
  });
  if (!analyse.success) {
    return { erreur: t(analyse.error.issues[0]?.message ?? m("Formulaire invalide.")) };
  }
  const { champId, libelle, obligatoire } = analyse.data;

  await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [champ] = await tx.select({ type: contactChampPersonnalise.type }).from(contactChampPersonnalise).where(eq(contactChampPersonnalise.id, champId));
    if (!champ) return;
    const options = TYPES_AVEC_OPTIONS.has(champ.type) ? optionsDepuisTexte(analyse.data.options) : undefined;
    await tx.update(contactChampPersonnalise).set({ libelle, obligatoire, options }).where(eq(contactChampPersonnalise.id, champId));
  });

  revalidatePath(CHEMIN);
  return null;
}

/** Supprime la définition ET toutes les valeurs déjà saisies pour ce champ (sinon la contrainte de clé étrangère bloquerait). */
export async function supprimerChampPersonnaliseContact(champId: string): Promise<void> {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte, "PARAMETRES", "SUPPRIMER")) return;

  await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    await tx.delete(contactChampValeur).where(eq(contactChampValeur.champId, champId));
    await tx.delete(contactChampPersonnalise).where(eq(contactChampPersonnalise.id, champId));
  });

  revalidatePath(CHEMIN);
}

/** Remplace intégralement l'ordre des champs — même patron que reordonnerChamps() de One Form. */
export async function reordonnerChampsPersonnalisesContact(idsOrdonnes: string[]): Promise<void> {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte, "PARAMETRES", "MODIFIER")) return;

  await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    for (let i = 0; i < idsOrdonnes.length; i++) {
      await tx
        .update(contactChampPersonnalise)
        .set({ ordre: i })
        .where(and(eq(contactChampPersonnalise.id, idsOrdonnes[i]), eq(contactChampPersonnalise.entrepriseId, utilisateurConnecte.entrepriseId)));
    }
  });

  revalidatePath(CHEMIN);
}

export async function listerChampsPersonnalisesContact(entrepriseId: string, tx: TransactionDrizzle) {
  return tx.select().from(contactChampPersonnalise).where(eq(contactChampPersonnalise.entrepriseId, entrepriseId)).orderBy(asc(contactChampPersonnalise.ordre));
}
