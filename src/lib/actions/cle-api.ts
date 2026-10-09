"use server";

import { z } from "zod";
import { and, eq, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { avecEntreprise } from "@/db/client";
import { cleApiEntreprise } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { genererCle } from "@/lib/api-externe/cle";
import { getT } from "@/lib/i18n/langue";
import { m } from "@/lib/i18n/catalogue";

const MAX_CLES_ACTIVES = 10;
const CHEMIN = "/app/parametres/integrations";

export type EtatCleApi = { erreur?: string; cleCree?: string; nomCle?: string } | null;

const schemaNom = z.object({ nom: z.string().trim().min(2, m("Donnez un nom à la clé (2 caractères minimum).")).max(80, m("Le nom est trop long (80 caractères maximum).")) });

/**
 * Créer une clé d'API (Administrateur seulement : elle donne un accès en écriture au CRM de l'entreprise). La clé en
 * clair est renvoyée UNE SEULE FOIS, dans la réponse de cette action ; la base ne garde que son empreinte, donc elle ne
 * pourra jamais être réaffichée — en cas de perte, on en crée une autre et on révoque l'ancienne.
 */
export async function creerCleApi(_etat: EtatCleApi, formData: FormData): Promise<EtatCleApi> {
  const t = await getT();
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (utilisateurConnecte.role !== "ADMIN" || !peut(utilisateurConnecte, "PARAMETRES", "MODIFIER")) {
    return { erreur: t("Seul l'administrateur peut gérer les clés d'API.") };
  }

  const analyse = schemaNom.safeParse({ nom: formData.get("nom") });
  if (!analyse.success) return { erreur: t(analyse.error.issues[0]?.message ?? m("Formulaire invalide.")) };

  const { cle, prefixe, empreinte } = genererCle();
  const resultat = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const actives = await tx
      .select({ id: cleApiEntreprise.id })
      .from(cleApiEntreprise)
      .where(and(eq(cleApiEntreprise.entrepriseId, utilisateurConnecte.entrepriseId), isNull(cleApiEntreprise.revoqueeLe)));
    if (actives.length >= MAX_CLES_ACTIVES) return { erreur: t("Limite de {n} clés actives atteinte : révoquez-en une d'abord.", { n: MAX_CLES_ACTIVES }) };

    await tx.insert(cleApiEntreprise).values({
      entrepriseId: utilisateurConnecte.entrepriseId,
      nom: analyse.data.nom,
      prefixe,
      empreinte,
      creeParId: utilisateurConnecte.utilisateurId,
    });
    return null;
  });
  if (resultat?.erreur) return resultat;

  revalidatePath(CHEMIN);
  return { cleCree: cle, nomCle: analyse.data.nom };
}

/** Révoquer une clé : effet immédiat (le prochain appel avec cette clé reçoit 401). Irréversible, la clé n'est jamais réactivée. */
export async function revoquerCleApi(cleId: string): Promise<{ erreur?: string }> {
  const t = await getT();
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (utilisateurConnecte.role !== "ADMIN" || !peut(utilisateurConnecte, "PARAMETRES", "MODIFIER")) {
    return { erreur: t("Seul l'administrateur peut gérer les clés d'API.") };
  }

  await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) =>
    tx
      .update(cleApiEntreprise)
      .set({ revoqueeLe: new Date() })
      .where(and(eq(cleApiEntreprise.id, cleId), eq(cleApiEntreprise.entrepriseId, utilisateurConnecte.entrepriseId), isNull(cleApiEntreprise.revoqueeLe)))
  );

  revalidatePath(CHEMIN);
  return {};
}
