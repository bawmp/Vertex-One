/**
 * Réactions et mentions — logique pure, partagée entre le serveur (qui décide qui est mentionné) et le navigateur
 * (qui met les mentions en évidence et propose l'auto-complétion). Aucune dépendance serveur.
 */

/** Emojis proposés en réaction : une liste fermée, validée côté serveur (jamais un emoji libre venu du client). */
export const EMOJIS_REACTION = ["👍", "❤️", "😂", "🎉", "🙏", "👀"] as const;

export function emojiValide(emoji: unknown): emoji is (typeof EMOJIS_REACTION)[number] {
  return typeof emoji === "string" && (EMOJIS_REACTION as readonly string[]).includes(emoji);
}

export type CandidatMention = { id: string; nom: string };

// Une mention est « @Nom Complet », précédée d'un début de texte ou d'un caractère qui n'est pas une lettre/un chiffre
// (pour ne pas prendre une adresse email pour une mention) et suivie d'une frontière de mot.
const AVANT = "(^|[^\\p{L}\\p{N}_@.])";
const APRES = "(?![\\p{L}\\p{N}_])";

const echapper = (texte: string) => texte.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Les noms les plus longs d'abord : « @Marie Claire » ne doit pas être lu comme « @Marie » suivi de « Claire ». */
function parLongueurDecroissante<T extends { nom: string }>(candidats: T[]): T[] {
  return [...candidats].filter((c) => c.nom.trim().length > 0).sort((a, b) => b.nom.length - a.nom.length);
}

/** Identifiants des personnes mentionnées dans le texte (sans doublon). */
export function extraireMentions(texte: string, candidats: CandidatMention[]): string[] {
  let reste = texte;
  const trouves = new Set<string>();
  for (const c of parLongueurDecroissante(candidats)) {
    const motif = new RegExp(`${AVANT}@${echapper(c.nom.trim())}${APRES}`, "giu");
    if (motif.test(reste)) {
      trouves.add(c.id);
      // On efface la mention reconnue pour qu'un nom plus court qui en fait partie ne soit pas compté en plus.
      reste = reste.replace(new RegExp(`${AVANT}@${echapper(c.nom.trim())}${APRES}`, "giu"), (_m, avant: string) => `${avant} `);
    }
  }
  return [...trouves];
}

export type MorceauTexte = { texte: string; mention: boolean };

/** Découpe un texte en morceaux ordinaires et mentions, pour afficher les mentions en évidence. */
export function decouperMentions(texte: string, noms: string[]): MorceauTexte[] {
  const valides = [...noms].map((n) => n.trim()).filter(Boolean).sort((a, b) => b.length - a.length);
  if (valides.length === 0) return [{ texte, mention: false }];

  const motif = new RegExp(`${AVANT}(@(?:${valides.map(echapper).join("|")}))${APRES}`, "giu");
  const morceaux: MorceauTexte[] = [];
  let dernier = 0;
  for (const m of texte.matchAll(motif)) {
    const avant = m[1] ?? "";
    const debutMention = (m.index ?? 0) + avant.length;
    if (debutMention > dernier) morceaux.push({ texte: texte.slice(dernier, debutMention), mention: false });
    morceaux.push({ texte: m[2], mention: true });
    dernier = debutMention + m[2].length;
  }
  if (dernier < texte.length) morceaux.push({ texte: texte.slice(dernier), mention: false });
  return morceaux.length > 0 ? morceaux : [{ texte, mention: false }];
}

/** Pour la recherche : neutralise les caractères spéciaux d'un motif ILIKE saisi par l'utilisateur. */
export function echapperMotifRecherche(saisie: string): string {
  return saisie.replace(/[\\%_]/g, "\\$&");
}
