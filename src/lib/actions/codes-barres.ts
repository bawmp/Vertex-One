"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { avecEntreprise } from "@/db/client";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { definirCodeBarres, genererCodeBarres, trouverParCode, type ProduitTrouve } from "@/lib/produits/codes-barres";
import { getT } from "@/lib/i18n/langue";

export type EtatCode = { erreur?: string; message?: string; code?: string | null } | null;

/**
 * Codes-barres. Fixer ou générer un code modifie le produit : droit « modifier ». Retrouver un produit par son code demande le droit
 * « voir » : la recherche reste dans l'entreprise de la session, jamais un identifiant d'entreprise du navigateur.
 */
async function garde(droit: "VOIR" | "MODIFIER") {
  const t = await getT();
  const u = await recupererUtilisateurConnecte();
  if (!u) redirect("/connexion");
  if (!peut(u, "PRODUITS", droit)) return { t, u, refus: droit === "MODIFIER" ? t("Vous n'avez pas le droit de modifier le stock.") : t("Vous n'avez pas accès au catalogue Produits.") };
  return { t, u, refus: null };
}

export async function definirCodeBarresProduit(produitId: string, code: string): Promise<EtatCode> {
  const { t, u, refus } = await garde("MODIFIER");
  if (refus) return { erreur: refus };
  const r = await avecEntreprise(u.entrepriseId, (tx) => definirCodeBarres(tx, u.entrepriseId, String(produitId), String(code ?? "")));
  if (!r.ok) return { erreur: t(r.erreur) };
  revalidatePath(`/app/produits/${produitId}`);
  return { message: r.code ? t("Code-barres enregistré.") : t("Code-barres retiré."), code: r.code };
}

export async function genererCodeBarresProduit(produitId: string): Promise<EtatCode> {
  const { t, u, refus } = await garde("MODIFIER");
  if (refus) return { erreur: refus };
  const r = await avecEntreprise(u.entrepriseId, (tx) => genererCodeBarres(tx, u.entrepriseId, String(produitId)));
  if (!r.ok) return { erreur: t(r.erreur) };
  revalidatePath(`/app/produits/${produitId}`);
  return { message: t("Code-barres généré."), code: r.code };
}

export type RechercheCode = { erreur?: string; produit?: ProduitTrouve } | null;

/** Appelé à chaque lecture (douchette, caméra ou saisie) : renvoie le produit de l'entreprise qui porte ce code, ou rien. */
export async function chercherProduitParCode(code: string): Promise<RechercheCode> {
  const { t, u, refus } = await garde("VOIR");
  if (refus) return { erreur: refus };
  const produit = await avecEntreprise(u.entrepriseId, (tx) => trouverParCode(tx, u.entrepriseId, String(code ?? "")));
  if (!produit) return { erreur: t("Aucun produit ne porte ce code.") };
  return { produit };
}
