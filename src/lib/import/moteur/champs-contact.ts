import { eq } from "drizzle-orm";
import { contactChampPersonnalise } from "@/db/schema";
import { TYPES_CHAMP_CONTACT, TYPES_AVEC_OPTIONS_CHAMP_CONTACT, LIBELLE_TYPE_CHAMP_CONTACT } from "@/lib/contact-champs-personnalises-types";
import { booleen, normaliser } from "../valeurs";
import { m } from "@/lib/i18n/catalogue";
import { avertir, erreur, lots, nouveauRapport, type ContexteImport, type LigneImport, type Rapport } from "./commun";

type TypeChamp = (typeof TYPES_CHAMP_CONTACT)[number];

const TYPE_DEPUIS_TEXTE = new Map<string, TypeChamp>([
  ...TYPES_CHAMP_CONTACT.map((t): [string, TypeChamp] => [normaliser(t), t]),
  ...TYPES_CHAMP_CONTACT.map((t): [string, TypeChamp] => [normaliser(LIBELLE_TYPE_CHAMP_CONTACT[t]), t]),
]);

/** Les choix d'une liste déroulante sont séparés par « | », « ; » ou un saut de ligne. */
export function optionsDepuisTexte(brut: string | undefined): string[] {
  return (brut ?? "")
    .split(/[|;\n]/)
    .map((o) => o.trim())
    .filter(Boolean);
}

/**
 * Champs personnalisés de la fiche contact d'un autre espace : un champ déjà présent sous le même nom est ignoré, jamais modifié.
 * Seule la STRUCTURE est reprise (nom, type, choix), jamais les valeurs saisies sur les contacts.
 */
export async function importerChampsContact(ctx: ContexteImport, lignes: LigneImport[]): Promise<Rapport> {
  const { tx, entrepriseId } = ctx;
  const rapport = nouveauRapport();

  const existants = await tx.select({ libelle: contactChampPersonnalise.libelle, ordre: contactChampPersonnalise.ordre }).from(contactChampPersonnalise).where(eq(contactChampPersonnalise.entrepriseId, entrepriseId));
  const vus = new Set(existants.map((c) => normaliser(c.libelle)));
  let ordre = existants.reduce((max, c) => Math.max(max, c.ordre), -1) + 1;

  const aCreer: (typeof contactChampPersonnalise.$inferInsert)[] = [];
  let typesInconnus = 0;

  for (const { numero, v } of lignes) {
    const libelle = (v.libelle ?? "").trim();
    if (!libelle) {
      erreur(rapport, numero, m("Nom du champ manquant."));
      continue;
    }
    if (vus.has(normaliser(libelle))) {
      rapport.ignores++;
      continue;
    }

    const texteType = (v.type ?? "").trim();
    let type = TYPE_DEPUIS_TEXTE.get(normaliser(texteType));
    if (!type) {
      if (texteType) typesInconnus++;
      type = "TEXTE_COURT";
    }
    const options = TYPES_AVEC_OPTIONS_CHAMP_CONTACT.has(type) ? optionsDepuisTexte(v.options) : undefined;
    if (TYPES_AVEC_OPTIONS_CHAMP_CONTACT.has(type) && (!options || options.length === 0)) {
      erreur(rapport, numero, m("Le champ « {libelle} » est une liste déroulante sans aucun choix."), { libelle });
      continue;
    }

    vus.add(normaliser(libelle));
    aCreer.push({ entrepriseId, libelle, type, obligatoire: booleen(v.obligatoire), options, ordre: ordre++ });
  }

  for (const lot of lots(aCreer)) await tx.insert(contactChampPersonnalise).values(lot);
  rapport.crees = aCreer.length;
  if (typesInconnus > 0) avertir(rapport, 0, m("{n} champ(s) de type inconnu : repris comme « texte court »."), { n: typesInconnus });
  return rapport;
}
