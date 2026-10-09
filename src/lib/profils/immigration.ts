import { and, eq } from "drizzle-orm";
import type { TransactionDrizzle } from "@/db/client";
import { contactChampPersonnalise } from "@/db/schema";

/**
 * Profil « immigration et mobilité internationale » (2026-10-09), pour une entreprise comme Global Mobility :
 * le vocabulaire (voir vocabulaire.ts) et ces champs de départ sur la fiche contact. Ce sont de vraies données de
 * l'entreprise (libellés libres, modifiables ou supprimables dans Paramètres), pas des champs imposés.
 *
 * Volontairement ABSENT de cette liste : le numéro de passeport et toute donnée d'identité. Ils ne doivent pas vivre
 * dans un champ libre visible de tous ceux qui voient le contact, mais dans une pièce privée (document sensible,
 * restreint à l'administrateur et au responsable, consigné au journal).
 */
export const CHAMPS_CONTACT_IMMIGRATION: { libelle: string; type: "TEXTE_COURT" | "LISTE_DEROULANTE" | "DATE"; options?: string[] }[] = [
  { libelle: "Nationalité", type: "TEXTE_COURT" },
  { libelle: "Pays de destination", type: "TEXTE_COURT" },
  { libelle: "Type de visa", type: "LISTE_DEROULANTE", options: ["Touristique", "Études", "Travail", "Affaires", "Regroupement familial", "Autre"] },
  { libelle: "Date du rendez-vous consulaire", type: "DATE" },
];

/** Sème les champs de départ du profil, sans jamais en doubler (rejouable). Sans effet pour les autres profils. */
export async function semerChampsDuProfil(tx: TransactionDrizzle, entrepriseId: string, secteurProfil: string): Promise<number> {
  if (secteurProfil !== "immigration") return 0;

  const existants = await tx
    .select({ libelle: contactChampPersonnalise.libelle })
    .from(contactChampPersonnalise)
    .where(and(eq(contactChampPersonnalise.entrepriseId, entrepriseId)));
  const deja = new Set(existants.map((c) => c.libelle));

  let ajoutes = 0;
  for (const [ordre, champ] of CHAMPS_CONTACT_IMMIGRATION.entries()) {
    if (deja.has(champ.libelle)) continue;
    await tx.insert(contactChampPersonnalise).values({
      entrepriseId,
      libelle: champ.libelle,
      type: champ.type,
      obligatoire: false,
      options: champ.options,
      ordre: existants.length + ordre,
    });
    ajoutes++;
  }
  return ajoutes;
}
