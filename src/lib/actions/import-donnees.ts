"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { avecEntreprise } from "@/db/client";
import { entreprise } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { getT } from "@/lib/i18n/langue";
import { refusImport } from "@/lib/import/droits";
import { disponible, type Fonctionnalite } from "@/lib/plans";
import { assainirCorrespondance, DEFINITIONS, proposerCorrespondance, TYPES_IMPORT, type TypeImport } from "@/lib/import/definitions";
import { lireTableau } from "@/lib/import/fichier";
import { appliquerCorrespondance, champsObligatoiresManquants, executerImport, SimulationTerminee, type Rapport } from "@/lib/import/moteur";

export type ApercuFichier =
  | { ok: true; entetes: string[]; exemple: Record<string, string>[]; nbLignes: number; correspondance: Record<string, string> }
  | { ok: false; erreur: string };

export type ResultatImport = { ok: true; simulation: boolean; rapport: Rapport } | { ok: false; erreur: string };

const FONCTIONNALITE: Record<TypeImport, Fonctionnalite | null> = {
  CONTACTS: "CRM",
  PRODUITS: "FACTURATION",
  PROJETS_TACHES: "PROJETS",
  DEVIS: "FACTURATION",
  FACTURES: "FACTURATION",
  NOTES: null,
};

function typeValide(brut: FormDataEntryValue | null): TypeImport | null {
  return typeof brut === "string" && (TYPES_IMPORT as readonly string[]).includes(brut) ? (brut as TypeImport) : null;
}

/** Étape 1 : lit le fichier (rien n'est enregistré) et propose l'association des colonnes. */
export async function analyserFichierImport(formData: FormData): Promise<ApercuFichier> {
  const t = await getT();
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) return { ok: false, erreur: t("Session expirée : reconnectez-vous.") };
  const type = typeValide(formData.get("type"));
  if (!type) return { ok: false, erreur: t("Type de données inconnu.") };
  const refus = refusImport(utilisateurConnecte, type, t);
  if (refus) return { ok: false, erreur: refus };

  const fichier = formData.get("fichier");
  if (!(fichier instanceof File) || fichier.size === 0) return { ok: false, erreur: t("Choisissez un fichier CSV ou Excel.") };
  const tableau = await lireTableau(fichier);
  if (!tableau.ok) return { ok: false, erreur: t(tableau.erreur, tableau.valeurs) };

  return {
    ok: true,
    entetes: tableau.entetes,
    exemple: tableau.lignes.slice(0, 5),
    nbLignes: tableau.lignes.length,
    correspondance: proposerCorrespondance(tableau.entetes, DEFINITIONS[type].champs),
  };
}

/**
 * Étape 2 (simulation = "1") et 3 (import réel). Le fichier est relu à chaque étape plutôt que conservé sur le serveur ;
 * la simulation exécute EXACTEMENT le même code que l'import, dans une transaction annulée à la fin : ce qu'elle annonce est
 * ce qui sera fait.
 */
export async function lancerImport(formData: FormData): Promise<ResultatImport> {
  const t = await getT();
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) return { ok: false, erreur: t("Session expirée : reconnectez-vous.") };
  const type = typeValide(formData.get("type"));
  if (!type) return { ok: false, erreur: t("Type de données inconnu.") };
  const refus = refusImport(utilisateurConnecte, type, t);
  if (refus) return { ok: false, erreur: refus };

  const fichier = formData.get("fichier");
  if (!(fichier instanceof File) || fichier.size === 0) return { ok: false, erreur: t("Choisissez un fichier CSV ou Excel.") };
  const tableau = await lireTableau(fichier);
  if (!tableau.ok) return { ok: false, erreur: t(tableau.erreur, tableau.valeurs) };

  let brute: unknown = null;
  try {
    brute = JSON.parse(String(formData.get("correspondance") ?? "{}"));
  } catch {
    return { ok: false, erreur: t("Association des colonnes illisible.") };
  }
  const correspondance = assainirCorrespondance(brute, DEFINITIONS[type].champs, tableau.entetes);
  const manquants = champsObligatoiresManquants(type, correspondance);
  if (manquants.length > 0) return { ok: false, erreur: t("Associez d'abord une colonne à : {liste}.", { liste: manquants.map((c) => t(c)).join(", ") }) };

  const lignes = appliquerCorrespondance(tableau.lignes, correspondance);
  if (lignes.length === 0) return { ok: false, erreur: t("Aucune ligne exploitable avec cette association de colonnes.") };

  const simulation = formData.get("simulation") === "1";
  const contactProjetsId = String(formData.get("contactProjetsId") ?? "").trim() || undefined;

  try {
    const rapport = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
      const fonctionnalite = FONCTIONNALITE[type];
      if (fonctionnalite) {
        const [monEntreprise] = await tx.select({ planAbonnement: entreprise.planAbonnement, statutAbonnement: entreprise.statutAbonnement }).from(entreprise).where(eq(entreprise.id, utilisateurConnecte.entrepriseId));
        if (!monEntreprise || !disponible(monEntreprise, fonctionnalite)) throw new Error("ABONNEMENT");
      }
      const resultat = await executerImport(tx, utilisateurConnecte, type, lignes, { contactProjetsId });
      if (simulation) throw new SimulationTerminee(resultat); // annule tout : rien n'est écrit
      return resultat;
    });
    revalidatePaths(type);
    return { ok: true, simulation: false, rapport };
  } catch (e) {
    if (e instanceof SimulationTerminee) return { ok: true, simulation: true, rapport: e.rapport };
    if (e instanceof Error && e.message === "ABONNEMENT") return { ok: false, erreur: t("Votre abonnement ne permet pas cet import actuellement.") };
    console.error("Import de données échoué", e);
    return { ok: false, erreur: t("L'import a échoué et rien n'a été enregistré. Réessayez ; si le problème persiste, découpez le fichier en plusieurs parties.") };
  }
}

function revalidatePaths(type: TypeImport) {
  const chemins: Record<TypeImport, string[]> = {
    CONTACTS: ["/app/contacts", "/app/comptes"],
    PRODUITS: ["/app/produits"],
    PROJETS_TACHES: ["/app/projets", "/app/documents"],
    DEVIS: ["/app/facturation", "/app/contacts"],
    FACTURES: ["/app/facturation", "/app/contacts"],
    NOTES: ["/app/mon-espace"],
  };
  for (const chemin of chemins[type]) revalidatePath(chemin);
}
