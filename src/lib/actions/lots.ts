"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { avecEntreprise } from "@/db/client";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { gestionStockActive, MESSAGE_STOCK_DESACTIVE } from "@/lib/produits/gestion-stock";
import { ajouterLot, definirSuiviLots, modifierPeremption, retirerLot } from "@/lib/produits/lots";
import { getT } from "@/lib/i18n/langue";

export type EtatLots = { erreur?: string; message?: string } | null;

/**
 * Lots et péremptions. Tout demande le droit de modifier les produits et la gestion de stock active, revérifiés ici. Le produit et le lot
 * sont relus dans l'entreprise de la session : jamais un identifiant d'une autre. Les motifs et les dates sont validés par la logique.
 */
async function garde() {
  const t = await getT();
  const u = await recupererUtilisateurConnecte();
  if (!u) redirect("/connexion");
  if (!peut(u, "PRODUITS", "MODIFIER")) return { t, u, refus: t("Vous n'avez pas le droit de modifier le stock.") };
  return { t, u, refus: null };
}

function rafraichir(produitId?: string) {
  if (produitId) revalidatePath(`/app/produits/${produitId}`);
  revalidatePath("/app/produits/peremptions");
  revalidatePath("/app/produits");
}

export async function definirSuiviLotsProduit(produitId: string, actif: boolean): Promise<EtatLots> {
  const { t, u, refus } = await garde();
  if (refus) return { erreur: refus };
  const r = await avecEntreprise(u.entrepriseId, async (tx) => ((await gestionStockActive(tx, u.entrepriseId)) ? definirSuiviLots(tx, u.entrepriseId, String(produitId), actif === true) : ({ ok: false, erreur: MESSAGE_STOCK_DESACTIVE } as const)));
  if (!r.ok) return { erreur: t(r.erreur) };
  rafraichir(produitId);
  return { message: actif ? t("Suivi par lots activé.") : t("Suivi par lots désactivé : les lots sont effacés, le stock ne change pas.") };
}

export async function ajouterLotProduit(produitId: string, _etat: EtatLots, formData: FormData): Promise<EtatLots> {
  const { t, u, refus } = await garde();
  if (refus) return { erreur: refus };
  const date = String(formData.get("datePeremption") ?? "").trim();
  const r = await avecEntreprise(u.entrepriseId, async (tx) =>
    (await gestionStockActive(tx, u.entrepriseId))
      ? ajouterLot(tx, u.entrepriseId, u.utilisateurId, {
          produitId: String(produitId),
          numeroLot: String(formData.get("numeroLot") ?? ""),
          datePeremption: date === "" ? null : date,
          quantite: Number(formData.get("quantite")),
          origine: formData.get("origine") === "ENTREE" ? "ENTREE" : "STOCK",
        })
      : ({ ok: false, erreur: MESSAGE_STOCK_DESACTIVE } as const)
  );
  if (!r.ok) return { erreur: t(r.erreur) };
  rafraichir(produitId);
  return { message: t("Lot enregistré.") };
}

export async function modifierPeremptionLot(lotId: string, produitId: string, datePeremption: string | null): Promise<EtatLots> {
  const { t, u, refus } = await garde();
  if (refus) return { erreur: refus };
  const date = datePeremption ? String(datePeremption).trim() : null;
  const r = await avecEntreprise(u.entrepriseId, async (tx) => ((await gestionStockActive(tx, u.entrepriseId)) ? modifierPeremption(tx, u.entrepriseId, String(lotId), date || null) : ({ ok: false, erreur: MESSAGE_STOCK_DESACTIVE } as const)));
  if (!r.ok) return { erreur: t(r.erreur) };
  rafraichir(produitId);
  return { message: t("Date enregistrée.") };
}

export async function retirerLotProduit(lotId: string, produitId: string, motif: string): Promise<EtatLots> {
  const { t, u, refus } = await garde();
  if (refus) return { erreur: refus };
  const r = await avecEntreprise(u.entrepriseId, async (tx) => ((await gestionStockActive(tx, u.entrepriseId)) ? retirerLot(tx, u.entrepriseId, u.utilisateurId, String(lotId), String(motif)) : ({ ok: false, erreur: MESSAGE_STOCK_DESACTIVE } as const)));
  if (!r.ok) return { erreur: t(r.erreur) };
  rafraichir(produitId);
  return { message: t("Lot retiré du stock.") };
}
