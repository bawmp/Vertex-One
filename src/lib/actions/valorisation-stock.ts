"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { avecEntreprise } from "@/db/client";
import { entreprise } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { disponible } from "@/lib/plans";
import { dateDouala } from "@/lib/comptabilite/livres";
import { constaterVariationStock } from "@/lib/produits/valorisation";
import { formaterFCFA } from "@/lib/facturation/calcul";
import { gestionStockActive, MESSAGE_STOCK_DESACTIVE } from "@/lib/produits/gestion-stock";
import { getT } from "@/lib/i18n/langue";
import { m } from "@/lib/i18n/catalogue";

export type EtatValorisation = { erreur?: string; message?: string } | null;

/**
 * Constate dans la comptabilité la variation de la valeur du stock (inventaire intermittent). Réservé à qui peut écrire en
 * comptabilité (l'Administrateur) ET voir les produits, sur le forfait comptabilité complète : tout est revérifié ici, jamais seulement
 * dans la page. La date vient du formulaire mais est lue à l'heure de Douala et bornée par le serveur (pas de futur, pas de période verrouillée).
 */
export async function enregistrerVariationStock(_etat: EtatValorisation, formData: FormData): Promise<EtatValorisation> {
  const t = await getT();
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte, "COMPTABILITE", "CREER") || !peut(utilisateurConnecte, "PRODUITS", "VOIR")) return { erreur: t("Vous n'avez pas le droit de passer cette écriture.") };

  const date = dateDouala(String(formData.get("date") ?? ""), true);
  if (!date) return { erreur: t("Date invalide.") };

  const resultat = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [monEntreprise] = await tx.select({ planAbonnement: entreprise.planAbonnement, statutAbonnement: entreprise.statutAbonnement }).from(entreprise).where(eq(entreprise.id, utilisateurConnecte.entrepriseId));
    if (!disponible(monEntreprise, "COMPTABILITE_COMPLETE")) return { ok: false, erreur: m("La comptabilité complète est disponible à partir du forfait Business.") } as const;
    if (!(await gestionStockActive(tx, utilisateurConnecte.entrepriseId))) return { ok: false, erreur: MESSAGE_STOCK_DESACTIVE } as const;
    return constaterVariationStock(tx, utilisateurConnecte.entrepriseId, utilisateurConnecte.utilisateurId, date);
  });
  if (!resultat.ok) return { erreur: t(resultat.erreur) };

  revalidatePath("/app/produits/valorisation");
  revalidatePath("/app/comptabilite");
  return { message: t("Écriture {numero} enregistrée : le stock {sens} de {montant}.", { numero: resultat.numero, sens: resultat.hausse ? t("a pris de la valeur") : t("a perdu de la valeur"), montant: formaterFCFA(resultat.montant) }) };
}
