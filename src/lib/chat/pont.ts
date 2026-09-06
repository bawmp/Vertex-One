import type { TransactionDrizzle } from "@/db/client";
import { canal } from "@/db/schema";
import { creerCanalChat, idExterneUtilisateur } from "./client";

/**
 * Palier 3, section 5 — la création d'un Projet crée automatiquement son
 * canal de discussion, avec le responsable principal comme premier membre.
 * Appelé à la fois par le pont automatique devis.accepte → Projet (Palier 2)
 * et par la création manuelle d'un Projet, pour ne jamais avoir à créer un
 * canal à la main.
 */
export async function creerCanalPourProjet(
  tx: TransactionDrizzle,
  params: { entrepriseId: string; projetId: string; titre: string; responsablePrincipalId: string }
): Promise<void> {
  const { idFournisseurChat } = await creerCanalChat({
    entrepriseId: params.entrepriseId,
    ancre: params.projetId,
    nom: params.titre,
    idsMembres: [idExterneUtilisateur(params.entrepriseId, params.responsablePrincipalId)],
  });

  await tx.insert(canal).values({
    entrepriseId: params.entrepriseId,
    nom: params.titre,
    type: "PROJET",
    projetId: params.projetId,
    idFournisseurChat,
  });
}
