import { eq } from "drizzle-orm";
import type { TransactionDrizzle } from "@/db/client";
import { lead, contact, compteClient, deal } from "@/db/schema";
import { enregistrerCreationDeal } from "@/lib/crm/historique";

export type ResultatConversion = { contactId: string; compteId: string | null; dealId: string };

/**
 * Docs de référence : Zoho CRM ("Once the lead is qualified, you can convert
 * the lead into a Contact, Account, and Deal" — échange du 2026-09-06).
 * Un Compte n'est créé que si le Lead avait une société renseignée (cas
 * B2B) ; un particulier devient un Contact sans Compte. Un Lead déjà
 * converti (convertiLe non NULL) ne peut pas l'être une seconde fois — la
 * fonction retourne null plutôt que de créer un doublon.
 */
export async function convertirLead(
  tx: TransactionDrizzle,
  params: { entrepriseId: string; leadId: string; modifieParId: string }
): Promise<ResultatConversion | null> {
  const [leLead] = await tx.select().from(lead).where(eq(lead.id, params.leadId));
  if (!leLead || leLead.convertiLe) return null;

  let compteId: string | null = null;
  if (leLead.societeCliente) {
    const [nouveauCompte] = await tx
      .insert(compteClient)
      .values({ entrepriseId: params.entrepriseId, nom: leLead.societeCliente })
      .returning({ id: compteClient.id });
    compteId = nouveauCompte.id;
  }

  const [nouveauContact] = await tx
    .insert(contact)
    .values({
      entrepriseId: params.entrepriseId,
      compteId,
      nom: leLead.nom,
      telephone: leLead.telephone,
      email: leLead.email,
      assigneAId: leLead.assigneAId,
    })
    .returning({ id: contact.id });

  const [nouveauDeal] = await tx
    .insert(deal)
    .values({
      entrepriseId: params.entrepriseId,
      titre: leLead.societeCliente ? `Opportunité — ${leLead.societeCliente}` : `Opportunité — ${leLead.nom}`,
      contactId: nouveauContact.id,
      compteId,
      assigneAId: leLead.assigneAId,
    })
    .returning({ id: deal.id, statut: deal.statut });

  await enregistrerCreationDeal(tx, {
    entrepriseId: params.entrepriseId,
    dealId: nouveauDeal.id,
    statut: nouveauDeal.statut,
    modifieParId: params.modifieParId,
  });

  await tx
    .update(lead)
    .set({ statut: "QUALIFIE", convertiLe: new Date(), contactConvertiId: nouveauContact.id, dealConvertiId: nouveauDeal.id })
    .where(eq(lead.id, params.leadId));

  return { contactId: nouveauContact.id, compteId, dealId: nouveauDeal.id };
}
