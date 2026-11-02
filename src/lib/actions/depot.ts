"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { avecEntreprise } from "@/db/client";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { archiverDepot, creerDepot, definirDepotPrincipal, renommerDepot, transfererStock, type ResultatDepot } from "@/lib/produits/depots";
import { gestionStockActive, MESSAGE_STOCK_DESACTIVE } from "@/lib/produits/gestion-stock";
import { getT } from "@/lib/i18n/langue";
import { m } from "@/lib/i18n/catalogue";

export type EtatDepot = { erreur?: string; message?: string } | null;

async function executer(travail: (tx: Parameters<Parameters<typeof avecEntreprise>[1]>[0], entrepriseId: string) => Promise<ResultatDepot>, succes: string): Promise<EtatDepot> {
  const t = await getT();
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte, "PRODUITS", "MODIFIER")) return { erreur: t("Vous n'avez pas le droit de modifier le stock.") };
  const resultat = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => ((await gestionStockActive(tx, utilisateurConnecte.entrepriseId)) ? travail(tx, utilisateurConnecte.entrepriseId) : ({ ok: false, erreur: MESSAGE_STOCK_DESACTIVE } as ResultatDepot)));
  if (!resultat.ok) return { erreur: t(resultat.erreur) };
  revalidatePath("/app/produits/depots");
  revalidatePath("/app/produits");
  return { message: t(succes) };
}

export async function ajouterDepot(_etat: EtatDepot, formData: FormData): Promise<EtatDepot> {
  const nom = String(formData.get("nom") ?? "");
  return executer((tx, entrepriseId) => creerDepot(tx, entrepriseId, nom), m("Dépôt ajouté."));
}

export async function renommerDepotAction(depotId: string, _etat: EtatDepot, formData: FormData): Promise<EtatDepot> {
  const nom = String(formData.get("nom") ?? "");
  return executer((tx, entrepriseId) => renommerDepot(tx, entrepriseId, depotId, nom), m("Nom du dépôt modifié."));
}

export async function choisirDepotPrincipal(depotId: string): Promise<EtatDepot> {
  return executer((tx, entrepriseId) => definirDepotPrincipal(tx, entrepriseId, depotId), m("Dépôt principal modifié : les prochaines ventes et achats y seront enregistrés."));
}

export async function archiverDepotAction(depotId: string): Promise<EtatDepot> {
  return executer((tx, entrepriseId) => archiverDepot(tx, entrepriseId, depotId), m("Dépôt archivé."));
}

/** Transfert d'un produit d'un dépôt à un autre depuis sa fiche : le stock total ne change pas, deux lignes d'historique le racontent. */
export async function transfererStockProduit(produitId: string, _etat: EtatDepot, formData: FormData): Promise<EtatDepot> {
  const t = await getT();
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte, "PRODUITS", "MODIFIER")) return { erreur: t("Vous n'avez pas le droit de modifier le stock.") };

  const resultat = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) =>
    !(await gestionStockActive(tx, utilisateurConnecte.entrepriseId))
      ? ({ ok: false, erreur: MESSAGE_STOCK_DESACTIVE } as const)
      : transfererStock(tx, utilisateurConnecte.entrepriseId, produitId, String(formData.get("depuis") ?? ""), String(formData.get("vers") ?? ""), Number(formData.get("quantite")), utilisateurConnecte.utilisateurId, String(formData.get("note") ?? "").slice(0, 300))
  );
  if (!resultat.ok) return { erreur: t(resultat.erreur) };
  revalidatePath(`/app/produits/${produitId}`);
  return { message: t("{n} transféré(s) de {depuis} vers {vers}.", { n: resultat.quantite, depuis: resultat.depuis, vers: resultat.vers }) };
}
