import { eq, and } from "drizzle-orm";
import type { TransactionDrizzle } from "@/db/client";
import { dossier, projet } from "@/db/schema";
import { libelleProjet } from "@/lib/vocabulaire";
import { creerCanalPourProjet } from "@/lib/chat/pont";

/**
 * Palier 2, section 3 — un devis accepté ne crée jamais un deuxième Dossier
 * pour un client déjà connu : un client fidèle qui recommande réutilise son
 * Dossier existant (unique par entrepriseId+prospectId) et n'accumule que de
 * nouveaux Projets à l'intérieur.
 */
export async function creerProjetDepuisDevisAccepte(
  tx: TransactionDrizzle,
  params: {
    entrepriseId: string;
    prospectId: string;
    prospectNom: string;
    secteurProfil: string;
    devisId: string;
    numeroDevis: string;
    responsableId: string;
  }
): Promise<{ dossierId: string; projetId: string }> {
  const [dossierExistant] = await tx
    .select({ id: dossier.id })
    .from(dossier)
    .where(and(eq(dossier.entrepriseId, params.entrepriseId), eq(dossier.prospectId, params.prospectId)));

  let dossierId = dossierExistant?.id;
  if (!dossierId) {
    const [nouveauDossier] = await tx
      .insert(dossier)
      .values({
        entrepriseId: params.entrepriseId,
        prospectId: params.prospectId,
        titre: params.prospectNom,
        responsableId: params.responsableId,
      })
      .returning({ id: dossier.id });
    dossierId = nouveauDossier.id;
  }

  const titreProjet = `${libelleProjet(params.secteurProfil).singulier} — ${params.numeroDevis}`;

  const [nouveauProjet] = await tx
    .insert(projet)
    .values({
      entrepriseId: params.entrepriseId,
      dossierId,
      titre: titreProjet,
      devisOrigineId: params.devisId,
      responsablePrincipalId: params.responsableId,
      statut: "A_FAIRE",
    })
    .returning({ id: projet.id });

  // Palier 3, section 5 — un canal de discussion par Projet, créé au même
  // moment, jamais à la main.
  await creerCanalPourProjet(tx, {
    entrepriseId: params.entrepriseId,
    projetId: nouveauProjet.id,
    titre: titreProjet,
    responsablePrincipalId: params.responsableId,
  });

  return { dossierId, projetId: nouveauProjet.id };
}
