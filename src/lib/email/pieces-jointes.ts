import { CATEGORIES_FICHIER, formaterTaille, nomAffichable, TAILLE_MAX_TOTAL_LIBELLE, TAILLE_MAX_TOTAL_OCTETS, validerFichier } from "@/lib/one-form/fichiers";
import { m } from "@/lib/i18n/catalogue";

/** Nombre maximal de pièces jointes d'un email écrit à un client depuis sa fiche. */
export const NB_MAX_PIECES_EMAIL = 5;

export type PieceEmail = { filename: string; content: Buffer };

/** Extensions qui désignent le même format (un JPEG s'appelle aussi bien « .jpg » que « .jpeg »). */
const EXTENSIONS_ADMISES: Record<string, string[]> = { jpg: ["jpg", "jpeg"] };

/** Une erreur = une clé française (traduite à l'affichage avec `t(cle, valeurs)`) et ses valeurs. */
export type ErreurPiecesEmail = { cle: string; valeurs?: Record<string, string | number> };
export type ResultatPiecesEmail = { ok: true; pieces: PieceEmail[] } | { ok: false; erreur: ErreurPiecesEmail };

/**
 * Valide les fichiers joints à un email : au plus cinq, 4 Mo au total (limite de corps de requête de Vercel, comme One Form et les
 * annonces), et chaque fichier reconnu sur ses OCTETS — image, PDF, Word ou Excel — jamais sur son nom ni son type déclaré (un
 * exécutable renommé « facture.pdf » est refusé). Les champs fichier vides (aucun fichier choisi) sont ignorés. À appeler AVANT tout envoi.
 */
export async function validerPiecesEmail(fichiers: FormDataEntryValue[]): Promise<ResultatPiecesEmail> {
  const presents = fichiers.filter((f): f is File => f instanceof File && f.size > 0);
  if (presents.length === 0) return { ok: true, pieces: [] };
  if (presents.length > NB_MAX_PIECES_EMAIL) return { ok: false, erreur: { cle: m("Un email accepte {n} pièces jointes au maximum."), valeurs: { n: NB_MAX_PIECES_EMAIL } } };

  const total = presents.reduce((somme, f) => somme + f.size, 0);
  if (total > TAILLE_MAX_TOTAL_OCTETS) {
    return { ok: false, erreur: { cle: m("Les pièces jointes dépassent {taille} au total ({envoyes} envoyés)."), valeurs: { taille: TAILLE_MAX_TOTAL_LIBELLE, envoyes: formaterTaille(total) } } };
  }

  const pieces: PieceEmail[] = [];
  for (const fichier of presents) {
    const octets = Buffer.from(await fichier.arrayBuffer());
    const verdict = validerFichier({ taille: octets.length, octets, categories: CATEGORIES_FICHIER });
    if (!verdict.ok) return { ok: false, erreur: { cle: m("« {nom} » : {raison}"), valeurs: { nom: nomAffichable(fichier.name), raison: verdict.erreur } } };
    // Le nom d'origine est nettoyé (chemin retiré, caractères de contrôle) ; si son extension ne correspond pas au format reconnu sur les
    // octets (ou manque), celle du vrai format est ajoutée : le destinataire ouvre le fichier avec le bon logiciel.
    const nom = nomAffichable(fichier.name);
    const admises = EXTENSIONS_ADMISES[verdict.format.extension] ?? [verdict.format.extension];
    const aLaBonneExtension = admises.some((e) => nom.toLowerCase().endsWith(`.${e}`));
    pieces.push({ filename: aLaBonneExtension ? nom : `${nom}.${verdict.format.extension}`, content: octets });
  }
  return { ok: true, pieces };
}
