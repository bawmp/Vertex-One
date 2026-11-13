"use server";

import { z } from "zod";
import { and, eq, isNull, ne } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { avecEntreprise } from "@/db/client";
import { connexionBoutique, depot, entreprise, stockPousse } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { getT } from "@/lib/i18n/langue";
import { m } from "@/lib/i18n/catalogue";
import { ErreurSite, normaliserAdresse, verifierHotePublic } from "@/lib/boutique/adresse-sure";
import { ErreurPlateforme } from "@/lib/boutique/types";
import { chiffrerConfig } from "@/lib/boutique/chiffrement";
import { apercuConnexion, fabriqueReelle, synchroniserConnexion, type ApercuConnexion, type ResultatSynchro } from "@/lib/boutique/synchro";

const CHEMIN = "/app/parametres/integrations";
const MAX_CONNEXIONS = 5;

export type EtatVerificationBoutique = { erreur?: string; apercu?: ApercuConnexion } | null;
export type EtatConnexionAuto = { erreur?: string; connecte?: { nom: string; resultat: ResultatSynchro } } | null;

const schemaWoo = z.object({
  adresse: z.string().trim().min(1, m("Collez l'adresse de votre site (ex. https://maboutique.com).")).max(300),
  cle: z.string().trim().min(8, m("Collez la « Clé client » de WooCommerce (elle commence par ck_).")).max(200),
  secret: z.string().trim().min(8, m("Collez le « Secret client » de WooCommerce (il commence par cs_).")).max(200),
  nom: z.string().trim().max(80).optional(),
  depot: z.string().trim().max(60).optional(),
});

/** Administrateur seulement : une boutique connectée peut faire sortir le stock de toute l'entreprise. */
async function administrateurOuErreur() {
  const t = await getT();
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (utilisateurConnecte.role !== "ADMIN" || !peut(utilisateurConnecte, "PARAMETRES", "MODIFIER")) {
    return { t, erreur: t("Seul l'administrateur peut connecter une boutique.") } as const;
  }
  return { t, utilisateurConnecte } as const;
}

/**
 * Vérifie ce que l'utilisateur a collé AVANT d'enregistrer quoi que ce soit : adresse valide et publique, clés acceptées par le site,
 * puis un aperçu en chiffres de ce qui va se passer (produits reconnus, sans équivalent…). Aucune écriture.
 */
async function preparer(formData: FormData, t: Awaited<ReturnType<typeof getT>>) {
  const analyse = schemaWoo.safeParse({ adresse: formData.get("adresse"), cle: formData.get("cle"), secret: formData.get("secret"), nom: formData.get("nom") || undefined, depot: formData.get("depot") || undefined });
  if (!analyse.success) return { erreur: t(analyse.error.issues[0]?.message ?? m("Formulaire invalide.")) } as const;
  const adresse = normaliserAdresse(analyse.data.adresse);
  if (!adresse.ok) return { erreur: t(adresse.erreur) } as const;
  const publique = await verifierHotePublic(adresse.adresse);
  if (!publique.ok) return { erreur: t(publique.erreur) } as const;
  const config = { adresse: adresse.adresse.base, cle: analyse.data.cle, secret: analyse.data.secret };
  const adaptateur = fabriqueReelle("WOOCOMMERCE", config);
  if (!adaptateur) return { erreur: t("Impossible de préparer la connexion : vérifiez l'adresse et les clés.") } as const;
  const test = await adaptateur.tester();
  if (!test.ok) return { erreur: t(test.erreur) } as const;
  return { config, adaptateur, donnees: analyse.data, base: adresse.adresse.base } as const;
}

export async function verifierWooCommerce(_etat: EtatVerificationBoutique, formData: FormData): Promise<EtatVerificationBoutique> {
  const acces = await administrateurOuErreur();
  if ("erreur" in acces) return { erreur: acces.erreur };
  const { t, utilisateurConnecte } = acces;
  const prepare = await preparer(formData, t);
  if ("erreur" in prepare) return { erreur: prepare.erreur };
  try {
    return { apercu: await apercuConnexion(utilisateurConnecte.entrepriseId, prepare.adaptateur) };
  } catch (e) {
    return { erreur: e instanceof ErreurPlateforme || e instanceof ErreurSite ? t(e.message) : t("Une erreur inattendue est survenue. Réessayez dans quelques minutes.") };
  }
}

/**
 * Enregistre la connexion (identifiants chiffrés) et lance aussitôt un premier tour. L'Administrateur doit avoir COCHÉ qu'il comprend que le
 * stock de son site sera remplacé par celui de Vertex One pour les produits reconnus : c'est le seul moment où l'on écrase le stock du site.
 * Le curseur démarre à l'instant de la connexion : les anciennes commandes du site ne sont jamais rejouées (le stock de Vertex One en tient déjà compte).
 */
export async function connecterWooCommerce(_etat: EtatConnexionAuto, formData: FormData): Promise<EtatConnexionAuto> {
  const acces = await administrateurOuErreur();
  if ("erreur" in acces) return { erreur: acces.erreur };
  const { t, utilisateurConnecte } = acces;
  if (formData.get("accepte") !== "on") return { erreur: t("Cochez la case pour confirmer que le stock de votre site sera remplacé par celui de Vertex One.") };

  const prepare = await preparer(formData, t);
  if ("erreur" in prepare) return { erreur: prepare.erreur };
  const nom = prepare.donnees.nom?.trim() || new URL(prepare.base).hostname.replace(/^www\./, "");

  const creation = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const actives = await tx.select({ id: connexionBoutique.id }).from(connexionBoutique).where(and(eq(connexionBoutique.entrepriseId, utilisateurConnecte.entrepriseId), isNull(connexionBoutique.archiveeLe), ne(connexionBoutique.type, "FICHIER")));
    if (actives.length >= MAX_CONNEXIONS) return { erreur: t("Limite de {n} boutiques connectées atteinte : déconnectez-en une d'abord.", { n: MAX_CONNEXIONS }) } as const;

    let depotId: string | null = null;
    if (prepare.donnees.depot) {
      const [choisi] = await tx.select({ id: depot.id }).from(depot).where(and(eq(depot.id, prepare.donnees.depot), eq(depot.entrepriseId, utilisateurConnecte.entrepriseId), eq(depot.actif, true)));
      if (!choisi) return { erreur: t("Ce dépôt n'existe pas ou n'est plus actif.") } as const;
      depotId = choisi.id;
    }
    const [cree] = await tx
      .insert(connexionBoutique)
      .values({
        entrepriseId: utilisateurConnecte.entrepriseId,
        type: "WOOCOMMERCE",
        nom,
        depotId,
        configChiffree: chiffrerConfig(prepare.config),
        curseur: new Date().toISOString(),
        creeParId: utilisateurConnecte.utilisateurId,
      })
      .returning({ id: connexionBoutique.id });
    await tx.update(entreprise).set({ synchroBoutiqueActive: true }).where(eq(entreprise.id, utilisateurConnecte.entrepriseId));
    return { id: cree.id } as const;
  });
  if ("erreur" in creation) return { erreur: creation.erreur };

  const resultat = await synchroniserConnexion(utilisateurConnecte.entrepriseId, creation.id);
  revalidatePath(CHEMIN);
  return { connecte: { nom, resultat } };
}

/** « Synchroniser maintenant » : un tour tout de suite, sans attendre les 5 minutes. La connexion doit appartenir à l'entreprise de l'appelant. */
export async function synchroniserMaintenant(connexionId: string): Promise<{ erreur?: string; resultat?: ResultatSynchro }> {
  const acces = await administrateurOuErreur();
  if ("erreur" in acces) return { erreur: acces.erreur };
  const { t, utilisateurConnecte } = acces;
  const resultat = await synchroniserConnexion(utilisateurConnecte.entrepriseId, connexionId);
  revalidatePath(CHEMIN);
  if (resultat.erreur) return { erreur: t(resultat.erreur), resultat };
  return { resultat };
}

/** Change le dépôt dont la boutique voit le stock (null = le dépôt principal). Le stock déjà envoyé est renvoyé au prochain tour. */
export async function definirDepotBoutique(connexionId: string, depotId: string | null): Promise<{ erreur?: string }> {
  const acces = await administrateurOuErreur();
  if ("erreur" in acces) return { erreur: acces.erreur };
  const { t, utilisateurConnecte } = acces;
  const resultat = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    if (depotId) {
      const [choisi] = await tx.select({ id: depot.id }).from(depot).where(and(eq(depot.id, depotId), eq(depot.entrepriseId, utilisateurConnecte.entrepriseId), eq(depot.actif, true)));
      if (!choisi) return { erreur: t("Ce dépôt n'existe pas ou n'est plus actif.") };
    }
    const modifiees = await tx
      .update(connexionBoutique)
      .set({ depotId })
      .where(and(eq(connexionBoutique.id, connexionId), eq(connexionBoutique.entrepriseId, utilisateurConnecte.entrepriseId), isNull(connexionBoutique.archiveeLe)))
      .returning({ id: connexionBoutique.id });
    if (modifiees.length === 0) return { erreur: t("Connexion introuvable.") };
    // Le stock affiché change de dépôt : tout est à renvoyer.
    await tx.delete(stockPousse).where(eq(stockPousse.connexionId, connexionId));
    return null;
  });
  if (resultat?.erreur) return resultat;
  revalidatePath(CHEMIN);
  return {};
}

/** Déconnecte une boutique : plus aucun échange, les identifiants sont EFFACÉS de la base. L'historique des commandes reçues est conservé. */
export async function deconnecterBoutique(connexionId: string): Promise<{ erreur?: string }> {
  const acces = await administrateurOuErreur();
  if ("erreur" in acces) return { erreur: acces.erreur };
  const { utilisateurConnecte } = acces;
  await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    await tx
      .update(connexionBoutique)
      .set({ archiveeLe: new Date(), configChiffree: null })
      .where(and(eq(connexionBoutique.id, connexionId), eq(connexionBoutique.entrepriseId, utilisateurConnecte.entrepriseId), isNull(connexionBoutique.archiveeLe), ne(connexionBoutique.type, "FICHIER")));
    await tx.delete(stockPousse).where(eq(stockPousse.connexionId, connexionId));
  });
  revalidatePath(CHEMIN);
  return {};
}
