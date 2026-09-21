import { CATEGORIES_FICHIER, formaterTaille, nomAffichable, TAILLE_MAX_TOTAL_LIBELLE, TAILLE_MAX_TOTAL_OCTETS, validerFichier } from "@/lib/one-form/fichiers";

/** Nombre maximal de pièces jointes par annonce. */
export const NB_MAX_PIECES_ANNONCE = 5;

export type PieceValidee = { octets: Buffer; mime: string; extension: string; nom: string; taille: number };

export type ResultatValidationPieces = { ok: true; pieces: PieceValidee[] } | { ok: false; erreur: string };

/**
 * Valide les fichiers envoyés avec une annonce : au plus cinq, 4 Mo au total (limite de corps de requête de Vercel,
 * comme One Form), et chaque fichier reconnu sur ses OCTETS — image, PDF, Word ou Excel — jamais sur son nom ni son type
 * déclaré. Les champs fichier vides (aucun fichier choisi) sont ignorés. À appeler AVANT tout accès au stockage.
 */
export async function validerPiecesAnnonce(fichiers: FormDataEntryValue[]): Promise<ResultatValidationPieces> {
  const presents = fichiers.filter((f): f is File => f instanceof File && f.size > 0);
  if (presents.length === 0) return { ok: true, pieces: [] };
  if (presents.length > NB_MAX_PIECES_ANNONCE) return { ok: false, erreur: `Une annonce accepte ${NB_MAX_PIECES_ANNONCE} pièces jointes au maximum.` };

  const total = presents.reduce((somme, f) => somme + f.size, 0);
  if (total > TAILLE_MAX_TOTAL_OCTETS) return { ok: false, erreur: `Les pièces jointes dépassent la taille maximale de ${TAILLE_MAX_TOTAL_LIBELLE} au total (${formaterTaille(total)} envoyés).` };

  const pieces: PieceValidee[] = [];
  for (const fichier of presents) {
    const octets = Buffer.from(await fichier.arrayBuffer());
    const verdict = validerFichier({ taille: octets.length, octets, categories: CATEGORIES_FICHIER });
    if (!verdict.ok) return { ok: false, erreur: `« ${nomAffichable(fichier.name)} » : ${verdict.erreur}` };
    pieces.push({ octets, mime: verdict.format.mime, extension: verdict.format.extension, nom: nomAffichable(fichier.name), taille: octets.length });
  }
  return { ok: true, pieces };
}
