import { eq, and, notExists, gte, inArray } from "drizzle-orm";
import type { TransactionDrizzle } from "@/db/client";
import { deal, contact, interaction } from "@/db/schema";
import { dossiersSansProjetActif } from "@/lib/projets/indicateurs";
import { envoyerWhatsApp } from "@/lib/whatsapp/client";

const SEUIL_DEAL_INACTIF_JOURS = 7;

const MODELE_RELANCE_PROPOSITION = (nom: string) =>
  `Bonjour ${nom}, votre proposition est toujours d'actualité — n'hésitez pas à revenir vers nous si vous avez des questions.`;
const MODELE_RELANCE_CLIENT = (nom: string) =>
  `Bonjour ${nom}, cela fait un moment que nous n'avons pas travaillé ensemble sur un nouveau projet — n'hésitez pas à nous contacter si un besoin se présente.`;

export type ResultatAutomatisation = { contactId: string; type: "deal_inactif" | "client_en_sommeil"; envoye: boolean; erreur?: string };

/**
 * Docs/palier-6-*, section 2 — relance automatique d'un Deal resté trop
 * longtemps sans interaction (étape PROPOSITION, aucune interaction avec
 * son Contact depuis SEUIL_DEAL_INACTIF_JOURS). Un déclencheur fixe et
 * prédéfini, pas un moteur de règles générique. L'interaction se
 * journalise sur le Contact (reconstruction Leads/Contacts/Comptes/Deals,
 * échange du 2026-09-06), d'où la jointure Deal → Contact → Interaction.
 */
export async function verifierProspectsInactifs(tx: TransactionDrizzle, entrepriseId: string): Promise<ResultatAutomatisation[]> {
  const seuil = new Date();
  seuil.setDate(seuil.getDate() - SEUIL_DEAL_INACTIF_JOURS);

  const dealsInactifs = await tx
    .select({ contactId: deal.contactId, nom: contact.nom, telephone: contact.telephone })
    .from(deal)
    .innerJoin(contact, eq(deal.contactId, contact.id))
    .where(
      and(
        eq(deal.entrepriseId, entrepriseId),
        eq(deal.statut, "PROPOSITION"),
        notExists(tx.select().from(interaction).where(and(eq(interaction.contactId, deal.contactId), gte(interaction.creeLe, seuil))))
      )
    );

  const resultats: ResultatAutomatisation[] = [];
  for (const d of dealsInactifs) {
    const { envoye, erreur } = await envoyerWhatsApp(d.telephone, MODELE_RELANCE_PROPOSITION(d.nom));
    resultats.push({ contactId: d.contactId, type: "deal_inactif", envoye, erreur });
  }
  return resultats;
}

/**
 * Relance d'un client sans nouveau projet depuis longtemps — réutilise
 * l'indicateur déjà construit au Palier 2 (docs/palier-6-*, section 2).
 */
export async function verifierClientsEnSommeil(tx: TransactionDrizzle, entrepriseId: string): Promise<ResultatAutomatisation[]> {
  const dossiers = await dossiersSansProjetActif(tx, entrepriseId);
  if (dossiers.length === 0) return [];

  const idsContacts = [...new Set(dossiers.map((d) => d.contactId))];
  const contacts = await tx
    .select({ id: contact.id, nom: contact.nom, telephone: contact.telephone })
    .from(contact)
    .where(and(eq(contact.entrepriseId, entrepriseId), inArray(contact.id, idsContacts)));
  const contactParId = new Map(contacts.map((c) => [c.id, c]));

  const resultats: ResultatAutomatisation[] = [];
  for (const id of idsContacts) {
    const c = contactParId.get(id);
    if (!c) continue;
    const { envoye, erreur } = await envoyerWhatsApp(c.telephone, MODELE_RELANCE_CLIENT(c.nom));
    resultats.push({ contactId: c.id, type: "client_en_sommeil", envoye, erreur });
  }
  return resultats;
}
