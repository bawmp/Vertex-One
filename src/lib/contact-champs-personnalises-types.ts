/**
 * Types de champ personnalisé Contact — dans un fichier séparé (pas dans
 * src/lib/actions/champ-personnalise-contact.ts) car un fichier "use server"
 * ne peut exporter que des fonctions async : une constante y provoque une
 * erreur runtime ("A \"use server\" file can only export async functions").
 */
export const TYPES_CHAMP_CONTACT = ["TEXTE_COURT", "TEXTE_LONG", "NOMBRE", "DATE", "EMAIL", "TELEPHONE", "CASE_A_COCHER", "LISTE_DEROULANTE"] as const;
export const TYPES_AVEC_OPTIONS_CHAMP_CONTACT = new Set(["LISTE_DEROULANTE"]);

/** Libellés français des types, utilisés dans les fichiers d'export / d'import des champs personnalisés (le fichier reste lisible dans Excel). */
export const LIBELLE_TYPE_CHAMP_CONTACT: Record<(typeof TYPES_CHAMP_CONTACT)[number], string> = {
  TEXTE_COURT: "Texte court",
  TEXTE_LONG: "Texte long",
  NOMBRE: "Nombre",
  DATE: "Date",
  EMAIL: "Email",
  TELEPHONE: "Téléphone",
  CASE_A_COCHER: "Case à cocher",
  LISTE_DEROULANTE: "Liste déroulante",
};
