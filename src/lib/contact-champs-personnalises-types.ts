/**
 * Types de champ personnalisé Contact — dans un fichier séparé (pas dans
 * src/lib/actions/champ-personnalise-contact.ts) car un fichier "use server"
 * ne peut exporter que des fonctions async : une constante y provoque une
 * erreur runtime ("A \"use server\" file can only export async functions").
 */
export const TYPES_CHAMP_CONTACT = ["TEXTE_COURT", "TEXTE_LONG", "NOMBRE", "DATE", "EMAIL", "TELEPHONE", "CASE_A_COCHER", "LISTE_DEROULANTE"] as const;
export const TYPES_AVEC_OPTIONS_CHAMP_CONTACT = new Set(["LISTE_DEROULANTE"]);
