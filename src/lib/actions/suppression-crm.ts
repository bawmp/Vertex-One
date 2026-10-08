"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { avecEntreprise } from "@/db/client";
import { lead, contact, deal } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { idsVisibles } from "@/lib/portee";
import { effacerObjetStockage } from "@/lib/documents/stockage";
import { supprimerLeadEnBase, supprimerDealEnBase, supprimerContactEnBase, expliquerRefus, type ResultatSuppression } from "@/lib/crm/suppression";
import { getT } from "@/lib/i18n/langue";
import { m } from "@/lib/i18n/catalogue";

export type EtatSuppression = { erreur?: string } | null;

/**
 * Supprimer un lead, un contact ou un deal : réservé à l'Administrateur (droit CRM/SUPPRIMER — jamais le rôle seul :
 * `peut()` reçoit l'utilisateur entier). Le serveur relit l'élément dans la portée CRM avant d'agir, supprime dans UNE
 * transaction (tout ou rien), puis efface les fichiers R2 éventuels, puis redirige vers la liste. Un refus (contact
 * encore lié à des factures, par exemple) est renvoyé avec la liste précise de ce qui bloque : il ne supprime jamais
 * à moitié.
 */
async function executer(
  type: "lead" | "contact" | "deal",
  id: string,
  agir: (tx: Parameters<Parameters<typeof avecEntreprise>[1]>[0], utilisateurId: string, entrepriseId: string) => Promise<ResultatSuppression>
): Promise<EtatSuppression> {
  const t = await getT();
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte, "CRM", "SUPPRIMER")) return { erreur: t("Seul l'administrateur peut supprimer.") };

  const resultat = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx): Promise<ResultatSuppression> => {
    const visibles = await idsVisibles(tx, utilisateurConnecte, "CRM");
    const [ligne] =
      type === "lead"
        ? await tx.select({ assigneAId: lead.assigneAId }).from(lead).where(eq(lead.id, id))
        : type === "contact"
          ? await tx.select({ assigneAId: contact.assigneAId }).from(contact).where(eq(contact.id, id))
          : await tx.select({ assigneAId: deal.assigneAId }).from(deal).where(eq(deal.id, id));
    if (!ligne || (visibles !== "TOUT" && !visibles.includes(ligne.assigneAId))) return { supprime: false, raison: m("Élément introuvable.") };
    return agir(tx, utilisateurConnecte.utilisateurId, utilisateurConnecte.entrepriseId);
  });

  if (!resultat.supprime) return { erreur: expliquerRefus(resultat, t) };

  for (const cle of resultat.clesStockage) await effacerObjetStockage(cle);

  const liste = type === "lead" ? "/app/leads" : type === "contact" ? "/app/contacts" : "/app/deals";
  revalidatePath(liste);
  revalidatePath("/app/facturation");
  revalidatePath("/app/documents");
  redirect(liste);
}

export async function supprimerLead(leadId: string): Promise<EtatSuppression> {
  return executer("lead", leadId, (tx) => supprimerLeadEnBase(tx, leadId));
}

export async function supprimerContact(contactId: string): Promise<EtatSuppression> {
  return executer("contact", contactId, (tx, utilisateurId, entrepriseId) => supprimerContactEnBase(tx, { entrepriseId, auteurId: utilisateurId, contactId }));
}

export async function supprimerDeal(dealId: string): Promise<EtatSuppression> {
  return executer("deal", dealId, (tx) => supprimerDealEnBase(tx, dealId));
}
