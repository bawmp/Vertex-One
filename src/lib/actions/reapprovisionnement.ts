"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { avecEntreprise } from "@/db/client";
import { entreprise } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { creerBonsDeCommande, definirReapprovisionnement, type DemandeCommande } from "@/lib/produits/reapprovisionnement";
import { gestionStockActive, MESSAGE_STOCK_DESACTIVE } from "@/lib/produits/gestion-stock";
import { getT } from "@/lib/i18n/langue";

export type EtatReappro = { erreur?: string; message?: string } | null;

/**
 * Crée les bons de commande fournisseur des produits cochés. Droits revérifiés ici : voir les produits ET créer un achat. Les lignes
 * viennent du navigateur (produit, quantité, fournisseur) mais chacune est relue et contrôlée dans la transaction de l'entreprise.
 */
export async function commanderProduits(demandes: DemandeCommande[]): Promise<EtatReappro> {
  const t = await getT();
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte, "PRODUITS", "VOIR") || !peut(utilisateurConnecte, "ACHATS", "CREER")) return { erreur: t("Vous n'avez pas le droit de créer un bon de commande.") };
  if (!Array.isArray(demandes)) return { erreur: t("Formulaire invalide.") };

  const propres = demandes.map((d) => ({ produitId: String(d?.produitId ?? ""), quantite: Number(d?.quantite), fournisseurId: String(d?.fournisseurId ?? "") }));
  const resultat = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) =>
    (await gestionStockActive(tx, utilisateurConnecte.entrepriseId)) ? creerBonsDeCommande(tx, utilisateurConnecte.entrepriseId, utilisateurConnecte.utilisateurId, propres) : ({ ok: false, erreur: MESSAGE_STOCK_DESACTIVE } as const)
  );
  if (!resultat.ok) return { erreur: t(resultat.erreur) };

  revalidatePath("/app/produits/reapprovisionnement");
  revalidatePath("/app/achats");
  return { message: t("{n} bon(s) de commande créé(s) en brouillon : {liste}.", { n: resultat.bons.length, liste: resultat.bons.map((b) => `${b.numero} (${b.fournisseur})`).join(", ") }) };
}

/** Fournisseur habituel et stock visé d'un produit. */
export async function definirReapprovisionnementProduit(produitId: string, _etat: EtatReappro, formData: FormData): Promise<EtatReappro> {
  const t = await getT();
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte, "PRODUITS", "MODIFIER")) return { erreur: t("Vous n'avez pas le droit de modifier le stock.") };

  const texte = String(formData.get("stockCible") ?? "").trim();
  const cible = texte === "" ? null : Number(texte);
  const fournisseurId = String(formData.get("fournisseurId") ?? "") || null;
  const resultat = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) =>
    (await gestionStockActive(tx, utilisateurConnecte.entrepriseId)) ? definirReapprovisionnement(tx, utilisateurConnecte.entrepriseId, produitId, fournisseurId, cible) : ({ ok: false, erreur: MESSAGE_STOCK_DESACTIVE } as const)
  );
  if (!resultat.ok) return { erreur: t(resultat.erreur) };

  revalidatePath(`/app/produits/${produitId}`);
  revalidatePath("/app/produits/reapprovisionnement");
  return { message: t("Réapprovisionnement enregistré.") };
}

/** Active ou coupe les alertes de stock bas par email de l'entreprise. Réservé à qui modifie les paramètres (l'Administrateur). */
export async function definirAlertesStockEmail(actif: boolean): Promise<EtatReappro> {
  const t = await getT();
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte, "PARAMETRES", "MODIFIER")) return { erreur: t("Seul l'Administrateur peut changer ce réglage.") };

  const resultat = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    if (!(await gestionStockActive(tx, utilisateurConnecte.entrepriseId))) return { ok: false } as const;
    await tx.update(entreprise).set({ alertesStockEmail: actif === true }).where(eq(entreprise.id, utilisateurConnecte.entrepriseId));
    return { ok: true } as const;
  });
  if (!resultat.ok) return { erreur: t(MESSAGE_STOCK_DESACTIVE) };

  revalidatePath("/app/produits/reapprovisionnement");
  return { message: actif ? t("Alertes de stock par email activées.") : t("Alertes de stock par email désactivées.") };
}
