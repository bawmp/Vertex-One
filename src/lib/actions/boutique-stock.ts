"use server";

import { z } from "zod";
import { and, eq, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { avecEntreprise } from "@/db/client";
import { cleApiEntreprise, depot } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { genererCle } from "@/lib/api-externe/cle";
import { getT } from "@/lib/i18n/langue";
import { m } from "@/lib/i18n/catalogue";

const MAX_CLES_ACTIVES = 10;
const CHEMIN = "/app/parametres/integrations";

export type EtatConnexionBoutique = { erreur?: string; cleCree?: string; nomConnexion?: string } | null;

const schemaConnexion = z.object({
  nom: z.string().trim().min(2, m("Donnez un nom à votre site (2 caractères minimum).")).max(80, m("Le nom est trop long (80 caractères maximum).")),
  depot: z.string().trim().max(60).optional(),
});

/** Administrateur seulement (la connexion donne au site le droit de faire sortir le stock). Renvoie l'utilisateur ou un message d'erreur. */
async function administrateurOuErreur() {
  const t = await getT();
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (utilisateurConnecte.role !== "ADMIN" || !peut(utilisateurConnecte, "PARAMETRES", "MODIFIER")) {
    return { t, erreur: t("Seul l'administrateur peut gérer les clés d'API.") } as const;
  }
  return { t, utilisateurConnecte } as const;
}

/**
 * Connecte une boutique en ligne : crée en un clic une clé d'API qui a le droit de lire le stock et de lui déclarer les commandes du site.
 * La clé en clair n'est renvoyée qu'UNE FOIS (la base n'en garde que l'empreinte). Le dépôt choisi est revérifié en base : il doit
 * appartenir à CETTE entreprise et être actif, jamais un identifiant pris tel quel du navigateur.
 */
export async function connecterBoutique(_etat: EtatConnexionBoutique, formData: FormData): Promise<EtatConnexionBoutique> {
  const acces = await administrateurOuErreur();
  if ("erreur" in acces) return { erreur: acces.erreur };
  const { t, utilisateurConnecte } = acces;

  const analyse = schemaConnexion.safeParse({ nom: formData.get("nom"), depot: (formData.get("depot") as string | null) || undefined });
  if (!analyse.success) return { erreur: t(analyse.error.issues[0]?.message ?? m("Formulaire invalide.")) };

  const { cle, prefixe, empreinte } = genererCle();
  const resultat = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const actives = await tx.select({ id: cleApiEntreprise.id }).from(cleApiEntreprise).where(and(eq(cleApiEntreprise.entrepriseId, utilisateurConnecte.entrepriseId), isNull(cleApiEntreprise.revoqueeLe)));
    if (actives.length >= MAX_CLES_ACTIVES) return { erreur: t("Limite de {n} clés actives atteinte : révoquez-en une d'abord.", { n: MAX_CLES_ACTIVES }) };

    let depotStockId: string | null = null;
    if (analyse.data.depot) {
      const [choisi] = await tx.select({ id: depot.id }).from(depot).where(and(eq(depot.id, analyse.data.depot), eq(depot.entrepriseId, utilisateurConnecte.entrepriseId), eq(depot.actif, true)));
      if (!choisi) return { erreur: t("Ce dépôt n'existe pas ou n'est plus actif.") };
      depotStockId = choisi.id;
    }

    await tx.insert(cleApiEntreprise).values({
      entrepriseId: utilisateurConnecte.entrepriseId,
      nom: analyse.data.nom,
      prefixe,
      empreinte,
      creeParId: utilisateurConnecte.utilisateurId,
      autoriseStock: true,
      depotStockId,
    });
    return null;
  });
  if (resultat?.erreur) return resultat;

  revalidatePath(CHEMIN);
  return { cleCree: cle, nomConnexion: analyse.data.nom };
}

/**
 * Change le dépôt dont une connexion voit le stock (null = le dépôt principal). La connexion doit appartenir à l'entreprise de l'appelant,
 * être active et autorisée au stock ; le dépôt est revérifié en base.
 */
export async function definirDepotConnexion(cleId: string, depotId: string | null): Promise<{ erreur?: string }> {
  const acces = await administrateurOuErreur();
  if ("erreur" in acces) return { erreur: acces.erreur };
  const { t, utilisateurConnecte } = acces;

  const resultat = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    if (depotId) {
      const [choisi] = await tx.select({ id: depot.id }).from(depot).where(and(eq(depot.id, depotId), eq(depot.entrepriseId, utilisateurConnecte.entrepriseId), eq(depot.actif, true)));
      if (!choisi) return { erreur: t("Ce dépôt n'existe pas ou n'est plus actif.") };
    }
    const modifiees = await tx
      .update(cleApiEntreprise)
      .set({ depotStockId: depotId })
      .where(and(eq(cleApiEntreprise.id, cleId), eq(cleApiEntreprise.entrepriseId, utilisateurConnecte.entrepriseId), eq(cleApiEntreprise.autoriseStock, true), isNull(cleApiEntreprise.revoqueeLe)))
      .returning({ id: cleApiEntreprise.id });
    return modifiees.length === 0 ? { erreur: t("Connexion introuvable.") } : null;
  });
  if (resultat?.erreur) return resultat;

  revalidatePath(CHEMIN);
  return {};
}

/** Accorde ou retire à une clé d'API déjà existante le droit de gérer le stock (Administrateur seulement ; clé active de SON entreprise). */
export async function definirAutorisationStockCle(cleId: string, actif: boolean): Promise<{ erreur?: string }> {
  const acces = await administrateurOuErreur();
  if ("erreur" in acces) return { erreur: acces.erreur };
  const { utilisateurConnecte } = acces;

  await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) =>
    tx
      .update(cleApiEntreprise)
      .set({ autoriseStock: actif === true })
      .where(and(eq(cleApiEntreprise.id, cleId), eq(cleApiEntreprise.entrepriseId, utilisateurConnecte.entrepriseId), isNull(cleApiEntreprise.revoqueeLe)))
  );

  revalidatePath(CHEMIN);
  return {};
}
