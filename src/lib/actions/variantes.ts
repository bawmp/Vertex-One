"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { avecEntreprise } from "@/db/client";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { gestionStockActive, MESSAGE_STOCK_DESACTIVE } from "@/lib/produits/gestion-stock";
import { ajouterConditionnement, ajouterVariantes, creerFamille, definirUnite, retirerConditionnement } from "@/lib/produits/variantes";
import { lireValeurs, type OptionVariante } from "@/lib/produits/variantes-regles";
import { getT } from "@/lib/i18n/langue";

export type EtatVariantes = { erreur?: string; message?: string } | null;

/**
 * Variantes, unité et conditionnements. Créer des variantes = créer des produits : droit « créer un produit » ; le reste modifie un produit
 * existant : droit « modifier ». La gestion de stock doit être active (entreprise de produits). Rien n'est cru du navigateur sans contrôle :
 * valeurs découpées et bornées, famille et produit relus dans l'entreprise de la session.
 */
function optionsDepuis(formData: FormData): OptionVariante[] {
  return [1, 2, 3].map((i) => ({ nom: String(formData.get(`option${i}`) ?? ""), valeurs: lireValeurs(String(formData.get(`valeurs${i}`) ?? "")) }));
}

const reglagesDepuis = (formData: FormData) => ({
  prixVente: Number(formData.get("prixVente") || 0),
  prixAchat: Number(formData.get("prixAchat") || 0),
  suiviStock: formData.get("suiviStock") === "on",
  stockInitial: Number(formData.get("stockInitial") || 0),
});

async function garde(droit: "CREER" | "MODIFIER") {
  const t = await getT();
  const u = await recupererUtilisateurConnecte();
  if (!u) redirect("/connexion");
  if (!peut(u, "PRODUITS", droit)) return { t, u, refus: droit === "CREER" ? t("Vous n'avez pas le droit de créer un produit.") : t("Vous n'avez pas le droit de modifier le stock.") };
  return { t, u, refus: null };
}

export async function creerFamilleAction(_etat: EtatVariantes, formData: FormData): Promise<EtatVariantes> {
  const { t, u, refus } = await garde("CREER");
  if (refus) return { erreur: refus };
  const r = await avecEntreprise(u.entrepriseId, async (tx) =>
    (await gestionStockActive(tx, u.entrepriseId)) ? creerFamille(tx, u.entrepriseId, u.utilisateurId, { nom: String(formData.get("nom") ?? ""), options: optionsDepuis(formData), ...reglagesDepuis(formData) }) : ({ ok: false, erreur: MESSAGE_STOCK_DESACTIVE } as const)
  );
  if (!r.ok) return { erreur: t(r.erreur) };
  revalidatePath("/app/produits");
  redirect(`/app/produits/familles/${r.familleId}`);
}

export async function ajouterVariantesAction(familleId: string, _etat: EtatVariantes, formData: FormData): Promise<EtatVariantes> {
  const { t, u, refus } = await garde("CREER");
  if (refus) return { erreur: refus };
  const r = await avecEntreprise(u.entrepriseId, async (tx) =>
    (await gestionStockActive(tx, u.entrepriseId)) ? ajouterVariantes(tx, u.entrepriseId, u.utilisateurId, String(familleId), optionsDepuis(formData), reglagesDepuis(formData)) : ({ ok: false, erreur: MESSAGE_STOCK_DESACTIVE } as const)
  );
  if (!r.ok) return { erreur: t(r.erreur) };
  revalidatePath(`/app/produits/familles/${familleId}`);
  revalidatePath("/app/produits");
  return { message: r.ignores > 0 ? t("{n} variante(s) ajoutée(s), {ignores} déjà existante(s) ignorée(s).", { n: r.crees, ignores: r.ignores }) : t("{n} variante(s) ajoutée(s).", { n: r.crees }) };
}

export async function definirUniteProduit(produitId: string, unite: string): Promise<EtatVariantes> {
  const { t, u, refus } = await garde("MODIFIER");
  if (refus) return { erreur: refus };
  const texte = String(unite ?? "").trim();
  const r = await avecEntreprise(u.entrepriseId, (tx) => definirUnite(tx, u.entrepriseId, String(produitId), texte === "" ? null : texte));
  if (!r.ok) return { erreur: t(r.erreur) };
  revalidatePath(`/app/produits/${produitId}`);
  return { message: t("Unité enregistrée.") };
}

export async function ajouterConditionnementProduit(produitId: string, nom: string, quantiteBase: number): Promise<EtatVariantes> {
  const { t, u, refus } = await garde("MODIFIER");
  if (refus) return { erreur: refus };
  const r = await avecEntreprise(u.entrepriseId, (tx) => ajouterConditionnement(tx, u.entrepriseId, String(produitId), String(nom ?? ""), Number(quantiteBase)));
  if (!r.ok) return { erreur: t(r.erreur) };
  revalidatePath(`/app/produits/${produitId}`);
  return { message: t("Conditionnement ajouté.") };
}

export async function retirerConditionnementProduit(conditionnementId: string, produitId: string): Promise<EtatVariantes> {
  const { t, u, refus } = await garde("MODIFIER");
  if (refus) return { erreur: refus };
  const r = await avecEntreprise(u.entrepriseId, (tx) => retirerConditionnement(tx, u.entrepriseId, String(conditionnementId)));
  if (!r.ok) return { erreur: t(r.erreur) };
  revalidatePath(`/app/produits/${produitId}`);
  return { message: t("Conditionnement retiré.") };
}
