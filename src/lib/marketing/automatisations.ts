import { eq, and, notExists, gte, inArray } from "drizzle-orm";
import type { TransactionDrizzle } from "@/db/client";
import { prospect, interaction } from "@/db/schema";
import { dossiersSansProjetActif } from "@/lib/projets/indicateurs";
import { envoyerWhatsApp } from "@/lib/whatsapp/client";

const SEUIL_PROSPECT_INACTIF_JOURS = 7;

const MODELE_RELANCE_PROPOSITION = (nom: string) =>
  `Bonjour ${nom}, votre proposition est toujours d'actualité — n'hésitez pas à revenir vers nous si vous avez des questions.`;
const MODELE_RELANCE_CLIENT = (nom: string) =>
  `Bonjour ${nom}, cela fait un moment que nous n'avons pas travaillé ensemble sur un nouveau projet — n'hésitez pas à nous contacter si un besoin se présente.`;

export type ResultatAutomatisation = { prospectId: string; type: "prospect_inactif" | "client_en_sommeil"; envoye: boolean; erreur?: string };

/**
 * Docs/palier-6-*, section 2 — relance automatique d'un prospect resté trop
 * longtemps sans interaction (portefeuille PROPOSITION, aucune interaction
 * depuis SEUIL_PROSPECT_INACTIF_JOURS). Un déclencheur fixe et prédéfini,
 * pas un moteur de règles générique.
 */
export async function verifierProspectsInactifs(tx: TransactionDrizzle, entrepriseId: string): Promise<ResultatAutomatisation[]> {
  const seuil = new Date();
  seuil.setDate(seuil.getDate() - SEUIL_PROSPECT_INACTIF_JOURS);

  const prospectsInactifs = await tx
    .select({ id: prospect.id, nom: prospect.nom, telephone: prospect.telephone })
    .from(prospect)
    .where(
      and(
        eq(prospect.entrepriseId, entrepriseId),
        eq(prospect.statut, "PROPOSITION"),
        notExists(tx.select().from(interaction).where(and(eq(interaction.prospectId, prospect.id), gte(interaction.creeLe, seuil))))
      )
    );

  const resultats: ResultatAutomatisation[] = [];
  for (const p of prospectsInactifs) {
    const { envoye, erreur } = await envoyerWhatsApp(p.telephone, MODELE_RELANCE_PROPOSITION(p.nom));
    resultats.push({ prospectId: p.id, type: "prospect_inactif", envoye, erreur });
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

  const idsProspects = [...new Set(dossiers.map((d) => d.prospectId))];
  const prospects = await tx
    .select({ id: prospect.id, nom: prospect.nom, telephone: prospect.telephone })
    .from(prospect)
    .where(and(eq(prospect.entrepriseId, entrepriseId), inArray(prospect.id, idsProspects)));
  const prospectParId = new Map(prospects.map((p) => [p.id, p]));

  const resultats: ResultatAutomatisation[] = [];
  for (const id of idsProspects) {
    const p = prospectParId.get(id);
    if (!p) continue;
    const { envoye, erreur } = await envoyerWhatsApp(p.telephone, MODELE_RELANCE_CLIENT(p.nom));
    resultats.push({ prospectId: p.id, type: "client_en_sommeil", envoye, erreur });
  }
  return resultats;
}
