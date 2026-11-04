"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { avecEntreprise } from "@/db/client";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { gestionStockActive, MESSAGE_STOCK_DESACTIVE } from "@/lib/produits/gestion-stock";
import { ajouterSeries, definirSuiviSerie, remettreSerieEnStock, remplacerSerieVendue, retirerSerie } from "@/lib/produits/series";
import { getT } from "@/lib/i18n/langue";

export type EtatSeries = { erreur?: string; message?: string } | null;

/**
 * Numéros de série. Tout demande le droit de modifier les produits et la gestion de stock active, revérifiés ici. Le produit et le numéro
 * sont relus dans l'entreprise de la session : jamais un identifiant d'une autre. La saisie est normalisée et bornée par la logique.
 */
async function garde() {
  const t = await getT();
  const u = await recupererUtilisateurConnecte();
  if (!u) redirect("/connexion");
  if (!peut(u, "PRODUITS", "MODIFIER")) return { t, u, refus: t("Vous n'avez pas le droit de modifier le stock.") };
  return { t, u, refus: null };
}

function rafraichir(produitId: string) {
  revalidatePath(`/app/produits/${produitId}`);
  revalidatePath("/app/produits/series");
  revalidatePath("/app/produits");
}

export async function definirSuiviSerieProduit(produitId: string, actif: boolean): Promise<EtatSeries> {
  const { t, u, refus } = await garde();
  if (refus) return { erreur: refus };
  const r = await avecEntreprise(u.entrepriseId, async (tx) => ((await gestionStockActive(tx, u.entrepriseId)) ? definirSuiviSerie(tx, u.entrepriseId, String(produitId), actif === true) : ({ ok: false, erreur: MESSAGE_STOCK_DESACTIVE } as const)));
  if (!r.ok) return { erreur: t(r.erreur) };
  rafraichir(produitId);
  return { message: actif ? t("Suivi par numéro de série activé.") : t("Suivi par numéro de série désactivé : les numéros sont effacés, le stock ne change pas.") };
}

export async function ajouterSeriesProduit(produitId: string, _etat: EtatSeries, formData: FormData): Promise<EtatSeries> {
  const { t, u, refus } = await garde();
  if (refus) return { erreur: refus };
  const r = await avecEntreprise(u.entrepriseId, async (tx) =>
    (await gestionStockActive(tx, u.entrepriseId))
      ? ajouterSeries(tx, u.entrepriseId, u.utilisateurId, String(produitId), String(formData.get("numeros") ?? ""), formData.get("origine") === "ENTREE" ? "ENTREE" : "STOCK")
      : ({ ok: false, erreur: MESSAGE_STOCK_DESACTIVE } as const)
  );
  if (!r.ok) return { erreur: t(r.erreur) };
  rafraichir(produitId);
  return { message: t("{n} numéro(s) de série ajouté(s).", { n: r.ajoutes ?? 0 }) };
}

export async function retirerSerieProduit(serieId: string, produitId: string, motif: string): Promise<EtatSeries> {
  const { t, u, refus } = await garde();
  if (refus) return { erreur: refus };
  const r = await avecEntreprise(u.entrepriseId, async (tx) => ((await gestionStockActive(tx, u.entrepriseId)) ? retirerSerie(tx, u.entrepriseId, u.utilisateurId, String(serieId), String(motif)) : ({ ok: false, erreur: MESSAGE_STOCK_DESACTIVE } as const)));
  if (!r.ok) return { erreur: t(r.erreur) };
  rafraichir(produitId);
  return { message: t("Unité retirée du stock.") };
}

export async function remettreSerieProduit(serieId: string, produitId: string): Promise<EtatSeries> {
  const { t, u, refus } = await garde();
  if (refus) return { erreur: refus };
  const r = await avecEntreprise(u.entrepriseId, async (tx) => ((await gestionStockActive(tx, u.entrepriseId)) ? remettreSerieEnStock(tx, u.entrepriseId, u.utilisateurId, String(serieId)) : ({ ok: false, erreur: MESSAGE_STOCK_DESACTIVE } as const)));
  if (!r.ok) return { erreur: t(r.erreur) };
  rafraichir(produitId);
  return { message: t("Unité remise en stock.") };
}

/** Change le numéro de série vendu sur une facture (depuis la fiche facture) : droit de modifier la facturation et gestion de stock active. */
export async function changerSerieVendue(factureId: string, venduId: string, nouveauId: string): Promise<EtatSeries> {
  const t = await getT();
  const u = await recupererUtilisateurConnecte();
  if (!u) redirect("/connexion");
  if (!peut(u, "FACTURATION", "MODIFIER")) return { erreur: t("Vous n'avez pas le droit de modifier cette facture.") };
  const r = await avecEntreprise(u.entrepriseId, async (tx) => ((await gestionStockActive(tx, u.entrepriseId)) ? remplacerSerieVendue(tx, u.entrepriseId, String(venduId), String(nouveauId)) : ({ ok: false, erreur: MESSAGE_STOCK_DESACTIVE } as const)));
  if (!r.ok) return { erreur: t(r.erreur) };
  revalidatePath(`/app/facturation/factures/${factureId}`);
  revalidatePath("/app/produits/series");
  return { message: t("Numéro de série échangé.") };
}
