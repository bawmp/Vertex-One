import type { TransactionDrizzle } from "@/db/client";
import type { UtilisateurConnecte } from "@/lib/session";
import { idsVisibles } from "@/lib/portee";
import { DEFINITIONS, type TypeImport } from "../definitions";
import { chargerEquipe, type ContexteImport, type LigneImport, type OptionsImport, type Rapport } from "./commun";
import { importerContacts } from "./contacts";
import { importerDocuments } from "./documents";
import { importerNotes } from "./notes";
import { importerProduits } from "./produits";
import { importerProjetsEtTaches } from "./projets-taches";

export type { Rapport, LigneImport, OptionsImport } from "./commun";

/** Marqueur lancé pour annuler la transaction d'une simulation : rien n'est jamais écrit, mais le rapport est celui d'un vrai import. */
export class SimulationTerminee extends Error {
  constructor(readonly rapport: Rapport) {
    super("simulation");
  }
}

/**
 * Applique la correspondance colonnes → champs. Seuls les champs associés figurent dans `v` (la présence d'une clé dit donc
 * « cette colonne existe dans le fichier », même vide) ; les lignes sans aucune valeur sont écartées.
 */
export function appliquerCorrespondance(lignes: Record<string, string>[], correspondance: Record<string, string>): LigneImport[] {
  const resultat: LigneImport[] = [];
  lignes.forEach((ligne, i) => {
    const v: Record<string, string> = {};
    for (const [cle, entete] of Object.entries(correspondance)) v[cle] = (ligne[entete] ?? "").trim();
    if (Object.values(v).some((valeur) => valeur !== "")) resultat.push({ numero: i + 2, v }); // ligne 1 = en-têtes
  });
  return resultat;
}

/** À appeler dans `avecEntreprise` : la même fonction sert la simulation (transaction annulée) et l'import réel. */
export async function executerImport(
  tx: TransactionDrizzle,
  utilisateurConnecte: UtilisateurConnecte,
  type: TypeImport,
  lignes: LigneImport[],
  options: OptionsImport
): Promise<Rapport> {
  const ctx: ContexteImport = {
    tx,
    entrepriseId: utilisateurConnecte.entrepriseId,
    utilisateurId: utilisateurConnecte.utilisateurId,
    visibleCrm: await idsVisibles(tx, utilisateurConnecte, "CRM"),
    options,
    utilisateurs: await chargerEquipe(tx, utilisateurConnecte.entrepriseId),
    responsablesInconnus: new Set(),
  };
  switch (type) {
    case "CONTACTS":
      return importerContacts(ctx, lignes);
    case "PRODUITS":
      return importerProduits(ctx, lignes);
    case "PROJETS_TACHES":
      return importerProjetsEtTaches(ctx, lignes);
    case "DEVIS":
      return importerDocuments(ctx, "DEVIS", lignes);
    case "FACTURES":
      return importerDocuments(ctx, "FACTURES", lignes);
    case "NOTES":
      return importerNotes(ctx, lignes);
  }
}

export function champsObligatoiresManquants(type: TypeImport, correspondance: Record<string, string>): string[] {
  return DEFINITIONS[type].champs.filter((c) => c.obligatoire && !correspondance[c.cle]).map((c) => c.libelle);
}
