"use server";

import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { avecEntreprise } from "@/db/client";
import { inventaireSession } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { gestionStockActive, MESSAGE_STOCK_DESACTIVE } from "@/lib/produits/gestion-stock";
import { annulerSessionInventaire, creerSessionInventaire, enregistrerComptage, validerSessionInventaire } from "@/lib/produits/inventaire-session";
import { getT } from "@/lib/i18n/langue";
import { m } from "@/lib/i18n/catalogue";

export type EtatInventaireSession = { erreur?: string; message?: string } | null;

const CHEMIN = "/app/produits/inventaire/sessions";

/**
 * Inventaire par sessions. Compter et ouvrir une session : droit de modifier les produits. Valider (ce qui corrige le stock) :
 * l'Administrateur seul. Annuler : l'Administrateur ou la personne qui a ouvert la session. Tout est revérifié ici ; le dépôt, la
 * session et les produits sont relus sous la protection par entreprise, jamais crus tels quels.
 */
async function garde() {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  return utilisateurConnecte;
}

export async function ouvrirInventaire(_etat: EtatInventaireSession, formData: FormData): Promise<EtatInventaireSession> {
  const t = await getT();
  const u = await garde();
  if (!peut(u, "PRODUITS", "MODIFIER")) return { erreur: t("Vous n'avez pas le droit de modifier le stock.") };
  const resultat = await avecEntreprise(u.entrepriseId, async (tx) =>
    (await gestionStockActive(tx, u.entrepriseId)) ? creerSessionInventaire(tx, u.entrepriseId, u.utilisateurId, String(formData.get("nom") ?? ""), String(formData.get("depotId") ?? "") || null) : ({ ok: false, erreur: MESSAGE_STOCK_DESACTIVE } as const)
  );
  if (!resultat.ok) return { erreur: t(resultat.erreur) };
  revalidatePath(CHEMIN);
  redirect(`${CHEMIN}/${resultat.id}`);
}

/** Enregistre le comptage d'un produit (quantité nulle = retirer le comptage). Appelé à chaque saisie validée. */
export async function compterProduit(sessionId: string, produitId: string, quantite: number | null): Promise<EtatInventaireSession> {
  const t = await getT();
  const u = await garde();
  if (!peut(u, "PRODUITS", "MODIFIER")) return { erreur: t("Vous n'avez pas le droit de modifier le stock.") };
  const q = quantite === null ? null : Number(quantite);
  const resultat = await avecEntreprise(u.entrepriseId, async (tx) =>
    (await gestionStockActive(tx, u.entrepriseId)) ? enregistrerComptage(tx, u.entrepriseId, u.utilisateurId, String(sessionId), String(produitId), q) : ({ ok: false, erreur: MESSAGE_STOCK_DESACTIVE } as const)
  );
  if (!resultat.ok) return { erreur: t(resultat.erreur) };
  return { message: t("Enregistré.") };
}

export async function validerInventaire(sessionId: string): Promise<EtatInventaireSession> {
  const t = await getT();
  const u = await garde();
  if (!peut(u, "PRODUITS", "MODIFIER") || !peut(u, "PARAMETRES", "MODIFIER")) return { erreur: t("Seul l'Administrateur peut valider un inventaire.") };
  const resultat = await avecEntreprise(u.entrepriseId, async (tx) =>
    (await gestionStockActive(tx, u.entrepriseId)) ? validerSessionInventaire(tx, u.entrepriseId, u.utilisateurId, String(sessionId)) : ({ ok: false, erreur: MESSAGE_STOCK_DESACTIVE } as const)
  );
  if (!resultat.ok) return { erreur: t(resultat.erreur) };
  revalidatePath(CHEMIN);
  revalidatePath(`${CHEMIN}/${sessionId}`);
  revalidatePath("/app/produits");
  return { message: t("Inventaire validé : {corriges} produit(s) corrigé(s), {inchanges} déjà exact(s).", { corriges: resultat.corriges, inchanges: resultat.inchanges }) };
}

export async function annulerInventaire(sessionId: string): Promise<EtatInventaireSession> {
  const t = await getT();
  const u = await garde();
  if (!peut(u, "PRODUITS", "MODIFIER")) return { erreur: t("Vous n'avez pas le droit de modifier le stock.") };
  const resultat = await avecEntreprise(u.entrepriseId, async (tx) => {
    const [s] = await tx.select({ creePar: inventaireSession.creeParId }).from(inventaireSession).where(and(eq(inventaireSession.id, String(sessionId)), eq(inventaireSession.entrepriseId, u.entrepriseId)));
    if (s && s.creePar !== u.utilisateurId && !peut(u, "PARAMETRES", "MODIFIER")) return { ok: false, erreur: m("Seul l'Administrateur ou la personne qui l'a ouvert peut abandonner cet inventaire.") } as const;
    return annulerSessionInventaire(tx, u.entrepriseId, u.utilisateurId, String(sessionId));
  });
  if (!resultat.ok) return { erreur: t(resultat.erreur) };
  revalidatePath(CHEMIN);
  revalidatePath(`${CHEMIN}/${sessionId}`);
  return { message: t("Inventaire abandonné : le stock n'a pas bougé.") };
}
