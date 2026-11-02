import { and, eq } from "drizzle-orm";
import type { TransactionDrizzle } from "@/db/client";
import { entreprise, produit } from "@/db/schema";
import { urlBase } from "@/lib/client-documents/liens";
import { adressesAAlerter, alerterParEmail, echapper } from "@/lib/notifications/equipe";
import { niveauStock, doitAlerter, niveauApresVerification } from "./niveau-stock";

export type ResultatAlertesStock = { actif: boolean; produitsSignales: number; adresses: number };

/**
 * Alertes de stock bas par email pour UNE entreprise : un seul email récapitulatif aux Administrateurs actifs, listant les produits qui
 * viennent de passer en stock bas ou en rupture (jamais deux fois le même niveau pour un produit ; un retour à la normale réarme
 * l'alerte). Ne fait rien si la gestion de stock est désactivée ou si l'Administrateur a coupé les alertes. À appeler dans la
 * transaction de l'entreprise (RLS). L'envoi est au mieux : un échec n'annule ni le marquage ni la tâche.
 */
export async function traiterAlertesStock(tx: TransactionDrizzle, entrepriseId: string): Promise<ResultatAlertesStock> {
  const [e] = await tx.select({ nom: entreprise.nom, gereStock: entreprise.gereStock, alertes: entreprise.alertesStockEmail }).from(entreprise).where(eq(entreprise.id, entrepriseId));
  if (!e?.gereStock || !e.alertes) return { actif: false, produitsSignales: 0, adresses: 0 };

  const produits = await tx
    .select({ id: produit.id, nom: produit.nom, type: produit.type, suiviStock: produit.suiviStock, stockActuel: produit.stockActuel, seuilAlerte: produit.seuilAlerte, precedent: produit.alerteStockNiveau })
    .from(produit)
    .where(and(eq(produit.entrepriseId, entrepriseId), eq(produit.type, "BIEN")));

  const aSignaler: { nom: string; niveau: "BAS" | "RUPTURE"; stock: number; seuil: number | null }[] = [];
  for (const p of produits) {
    const courant = niveauStock(p);
    const suivant = niveauApresVerification(courant);
    if (doitAlerter(p.precedent, courant) && suivant) aSignaler.push({ nom: p.nom, niveau: suivant, stock: p.stockActuel, seuil: p.seuilAlerte });
    if (suivant !== p.precedent) await tx.update(produit).set({ alerteStockNiveau: suivant }).where(and(eq(produit.id, p.id), eq(produit.entrepriseId, entrepriseId)));
  }
  if (aSignaler.length === 0) return { actif: true, produitsSignales: 0, adresses: 0 };

  const adresses = await adressesAAlerter(tx, entrepriseId);
  const lignes = aSignaler
    .sort((a, b) => (a.niveau === b.niveau ? a.nom.localeCompare(b.nom) : a.niveau === "RUPTURE" ? -1 : 1))
    .map((p) => `<li><strong>${echapper(p.nom)}</strong> — ${p.niveau === "RUPTURE" ? "en rupture" : "stock bas"} (${p.stock} en stock${p.seuil !== null ? `, seuil ${p.seuil}` : ""})</li>`)
    .join("");
  const ruptures = aSignaler.filter((p) => p.niveau === "RUPTURE").length;
  await alerterParEmail(
    adresses,
    ruptures > 0 ? `Stock : ${ruptures} produit(s) en rupture, ${aSignaler.length - ruptures} en stock bas` : `Stock : ${aSignaler.length} produit(s) en stock bas`,
    `<p>Bonjour,</p><p>Ces produits de <strong>${echapper(e.nom)}</strong> demandent votre attention :</p><ul>${lignes}</ul><p><a href="${urlBase()}/app/produits/reapprovisionnement">Voir ce qu'il faut commander</a> — vous pouvez y créer les bons de commande en un clic.</p><p style="color:#666;font-size:12px">Vous recevez cet email car les alertes de stock sont activées. Un administrateur peut les désactiver depuis la page « À réapprovisionner ».</p>`
  );
  return { actif: true, produitsSignales: aSignaler.length, adresses: adresses.length };
}
