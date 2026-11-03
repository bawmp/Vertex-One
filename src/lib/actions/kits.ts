"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { avecEntreprise } from "@/db/client";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { gestionStockActive, MESSAGE_STOCK_DESACTIVE } from "@/lib/produits/gestion-stock";
import { ajouterComposant, creerKit, retirerComposant } from "@/lib/produits/kits";
import { getT } from "@/lib/i18n/langue";

export type EtatKit = { erreur?: string; message?: string } | null;

/**
 * Kits. Créer un kit crée un produit : droit « créer un produit ». Changer sa composition modifie un produit : droit « modifier ».
 * Les produits composants sont relus dans l'entreprise de la session et contrôlés (bien suivi, pas un kit) ; les quantités sont des entiers
 * bornés. Rien du navigateur n'est cru tel quel.
 */
async function garde(droit: "CREER" | "MODIFIER") {
  const t = await getT();
  const u = await recupererUtilisateurConnecte();
  if (!u) redirect("/connexion");
  if (!peut(u, "PRODUITS", droit)) return { t, u, refus: droit === "CREER" ? t("Vous n'avez pas le droit de créer un produit.") : t("Vous n'avez pas le droit de modifier le stock.") };
  return { t, u, refus: null };
}

export async function creerKitAction(_etat: EtatKit, formData: FormData): Promise<EtatKit> {
  const { t, u, refus } = await garde("CREER");
  if (refus) return { erreur: refus };
  const ids = formData.getAll("composantId").map(String);
  const quantites = formData.getAll("quantite").map((q) => Number(q));
  const composants = ids.map((produitId, i) => ({ produitId, quantite: quantites[i] })).filter((c) => c.produitId !== "");
  const r = await avecEntreprise(u.entrepriseId, async (tx) =>
    (await gestionStockActive(tx, u.entrepriseId)) ? creerKit(tx, u.entrepriseId, u.utilisateurId, { nom: String(formData.get("nom") ?? ""), prixVente: Number(formData.get("prixVente") || 0), composants }) : ({ ok: false, erreur: MESSAGE_STOCK_DESACTIVE } as const)
  );
  if (!r.ok) return { erreur: t(r.erreur) };
  revalidatePath("/app/produits");
  redirect(`/app/produits/${r.id}`);
}

export async function ajouterComposantKit(kitId: string, composantId: string, quantite: number): Promise<EtatKit> {
  const { t, u, refus } = await garde("MODIFIER");
  if (refus) return { erreur: refus };
  const r = await avecEntreprise(u.entrepriseId, async (tx) => ((await gestionStockActive(tx, u.entrepriseId)) ? ajouterComposant(tx, u.entrepriseId, String(kitId), String(composantId), Number(quantite)) : ({ ok: false, erreur: MESSAGE_STOCK_DESACTIVE } as const)));
  if (!r.ok) return { erreur: t(r.erreur) };
  revalidatePath(`/app/produits/${kitId}`);
  return { message: t("Produit ajouté au kit.") };
}

export async function retirerComposantKit(kitId: string, composantId: string): Promise<EtatKit> {
  const { t, u, refus } = await garde("MODIFIER");
  if (refus) return { erreur: refus };
  const r = await avecEntreprise(u.entrepriseId, async (tx) => ((await gestionStockActive(tx, u.entrepriseId)) ? retirerComposant(tx, u.entrepriseId, String(kitId), String(composantId)) : ({ ok: false, erreur: MESSAGE_STOCK_DESACTIVE } as const)));
  if (!r.ok) return { erreur: t(r.erreur) };
  revalidatePath(`/app/produits/${kitId}`);
  return { message: t("Produit retiré du kit.") };
}
