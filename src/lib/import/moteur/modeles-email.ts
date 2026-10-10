import { eq } from "drizzle-orm";
import { modeleEmail, typeModeleEmail } from "@/db/schema";
import { normaliser } from "../valeurs";
import { m } from "@/lib/i18n/catalogue";
import { erreur, nouveauRapport, type ContexteImport, type LigneImport, type Rapport } from "./commun";

type TypeModele = (typeof typeModeleEmail.enumValues)[number];

/** Libellés français des modèles, utilisés dans les fichiers d'export / d'import. */
export const LIBELLE_MODELE_EMAIL: Record<TypeModele, string> = {
  ENVOI_DEVIS: "Envoi de devis",
  ENVOI_FACTURE: "Envoi de facture",
  CANDIDATURE_EN_EXAMEN: "Candidature en examen",
  CANDIDATURE_ENTRETIEN: "Candidature entretien",
  CANDIDATURE_OFFRE: "Candidature offre",
  CANDIDATURE_EMBAUCHE: "Candidature embauche",
  CANDIDATURE_REJETEE: "Candidature rejetée",
};

const TYPE_DEPUIS_TEXTE = new Map<string, TypeModele>(
  (Object.keys(LIBELLE_MODELE_EMAIL) as TypeModele[]).flatMap((t): [string, TypeModele][] => [
    [normaliser(t), t],
    [normaliser(LIBELLE_MODELE_EMAIL[t]), t],
  ])
);

/**
 * Textes d'envoi des devis, des factures et des emails aux candidats d'un autre espace. Un modèle DÉJÀ personnalisé dans cet espace n'est jamais écrasé
 * (compté comme ignoré) : reprendre la structure d'un autre espace ne doit pas détruire un texte que l'on a soigné ici.
 */
export async function importerModelesEmail(ctx: ContexteImport, lignes: LigneImport[]): Promise<Rapport> {
  const { tx, entrepriseId } = ctx;
  const rapport = nouveauRapport();

  const existants = await tx.select({ type: modeleEmail.type }).from(modeleEmail).where(eq(modeleEmail.entrepriseId, entrepriseId));
  const dejaPersonnalises = new Set<TypeModele>(existants.map((e) => e.type));

  for (const { numero, v } of lignes) {
    const type = TYPE_DEPUIS_TEXTE.get(normaliser(v.type ?? ""));
    if (!type) {
      erreur(rapport, numero, m("Modèle inconnu : « {valeur} » (attendu : un des types de la colonne « Type » d'un export de modèles d'email)."), { valeur: (v.type ?? "").trim() });
      continue;
    }
    const objet = (v.objet ?? "").trim();
    const corps = (v.corps ?? "").trim();
    if (!objet || !corps) {
      erreur(rapport, numero, m("Objet ou corps du message manquant."));
      continue;
    }
    if (dejaPersonnalises.has(type)) {
      rapport.ignores++;
      continue;
    }
    dejaPersonnalises.add(type);
    await tx.insert(modeleEmail).values({ entrepriseId, type, objet: objet.slice(0, 300), corps: corps.slice(0, 10_000) });
    rapport.crees++;
  }
  return rapport;
}
