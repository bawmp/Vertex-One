/**
 * Contenu d'un document rédigé (voir `documentRedige`, src/db/schema.ts) : le document de l'éditeur TipTap, en JSON.
 *
 * JAMAIS de HTML stocké ni rendu : le contenu envoyé par le navigateur est revalidé ici en LISTE BLANCHE (types de blocs,
 * styles de texte, attributs autorisés, tailles bornées) avant d'être enregistré, puis converti en PDF et en Word à
 * partir de cette seule structure. Tout ce qui n'est pas prévu est écarté en silence (jamais interprété).
 */

export type Alignement = "left" | "center" | "right" | "justify";
export type StyleTexte = "bold" | "italic" | "underline" | "strike";

export type NoeudTexte = { type: "text"; text: string; marks?: { type: StyleTexte }[] };
export type NoeudRedaction =
  | NoeudTexte
  | { type: "hardBreak" }
  | { type: "paragraph"; attrs?: { textAlign?: Alignement }; content?: NoeudRedaction[] }
  | { type: "heading"; attrs: { level: 1 | 2 | 3; textAlign?: Alignement }; content?: NoeudRedaction[] }
  | { type: "bulletList"; content: NoeudRedaction[] }
  | { type: "orderedList"; content: NoeudRedaction[] }
  | { type: "listItem"; content: NoeudRedaction[] }
  | { type: "blockquote"; content: NoeudRedaction[] }
  | { type: "horizontalRule" }
  | { type: "pageBreak" }
  | { type: "table"; content: NoeudRedaction[] }
  | { type: "tableRow"; content: NoeudRedaction[] }
  | { type: "tableCell"; attrs?: { colspan?: number; rowspan?: number }; content: NoeudRedaction[] }
  | { type: "tableHeader"; attrs?: { colspan?: number; rowspan?: number }; content: NoeudRedaction[] }
  | { type: "image"; attrs: { src: string; alt?: string; largeur?: number } };

export type ContenuRedaction = { type: "doc"; content: NoeudRedaction[] };

export const LIMITES = {
  octetsJsonMax: 4_000_000, // le document entier, images comprises (la limite de corps de requête de Vercel est de 4,5 Mo)
  profondeurMax: 12,
  noeudsMax: 20_000,
  texteMax: 50_000, // caractères par morceau de texte
  imagesMax: 8,
  octetsImageMax: 1_000_000, // par image, une fois décodée
  titreMax: 150,
} as const;

const ALIGNEMENTS: readonly Alignement[] = ["left", "center", "right", "justify"];
const STYLES: readonly StyleTexte[] = ["bold", "italic", "underline", "strike"];
const IMAGE_DATA = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/;

export function contenuVide(): ContenuRedaction {
  return { type: "doc", content: [{ type: "paragraph" }] };
}

type Compteurs = { noeuds: number; images: number };

function alignement(valeur: unknown): Alignement | undefined {
  return typeof valeur === "string" && (ALIGNEMENTS as readonly string[]).includes(valeur) ? (valeur as Alignement) : undefined;
}

function entierBorne(valeur: unknown, min: number, max: number): number | undefined {
  return typeof valeur === "number" && Number.isInteger(valeur) && valeur >= min && valeur <= max ? valeur : undefined;
}

function nettoyerEnfants(brut: unknown, profondeur: number, c: Compteurs): NoeudRedaction[] {
  if (!Array.isArray(brut)) return [];
  const resultat: NoeudRedaction[] = [];
  for (const enfant of brut) {
    const noeud = nettoyerNoeud(enfant, profondeur + 1, c);
    if (noeud) resultat.push(noeud);
  }
  return resultat;
}

function nettoyerNoeud(brut: unknown, profondeur: number, c: Compteurs): NoeudRedaction | null {
  if (profondeur > LIMITES.profondeurMax || !brut || typeof brut !== "object") return null;
  if (++c.noeuds > LIMITES.noeudsMax) throw new Error("Document trop volumineux.");
  const n = brut as { type?: unknown; text?: unknown; marks?: unknown; attrs?: Record<string, unknown>; content?: unknown };
  const attrs = n.attrs && typeof n.attrs === "object" ? n.attrs : {};

  switch (n.type) {
    case "text": {
      if (typeof n.text !== "string" || n.text.length === 0) return null;
      const marks = Array.isArray(n.marks)
        ? [...new Set(n.marks.map((m) => (m && typeof m === "object" ? (m as { type?: unknown }).type : null)).filter((t): t is StyleTexte => typeof t === "string" && (STYLES as readonly string[]).includes(t)))].map((type) => ({ type }))
        : [];
      return marks.length ? { type: "text", text: n.text.slice(0, LIMITES.texteMax), marks } : { type: "text", text: n.text.slice(0, LIMITES.texteMax) };
    }
    case "hardBreak":
      return { type: "hardBreak" };
    case "horizontalRule":
      return { type: "horizontalRule" };
    case "pageBreak":
      return { type: "pageBreak" };
    case "paragraph": {
      const a = alignement(attrs.textAlign);
      const content = nettoyerEnfants(n.content, profondeur, c);
      return { type: "paragraph", ...(a ? { attrs: { textAlign: a } } : {}), ...(content.length ? { content } : {}) };
    }
    case "heading": {
      const level = entierBorne(attrs.level, 1, 3) ?? 1;
      const a = alignement(attrs.textAlign);
      const content = nettoyerEnfants(n.content, profondeur, c);
      return { type: "heading", attrs: { level: level as 1 | 2 | 3, ...(a ? { textAlign: a } : {}) }, ...(content.length ? { content } : {}) };
    }
    case "bulletList":
    case "orderedList":
    case "listItem":
    case "blockquote":
    case "table":
    case "tableRow": {
      const content = nettoyerEnfants(n.content, profondeur, c);
      return content.length ? ({ type: n.type, content } as NoeudRedaction) : null;
    }
    case "tableCell":
    case "tableHeader": {
      const content = nettoyerEnfants(n.content, profondeur, c);
      const colspan = entierBorne(attrs.colspan, 1, 12);
      const rowspan = entierBorne(attrs.rowspan, 1, 50);
      const garde = { ...(colspan && colspan > 1 ? { colspan } : {}), ...(rowspan && rowspan > 1 ? { rowspan } : {}) };
      return { type: n.type, ...(Object.keys(garde).length ? { attrs: garde } : {}), content: content.length ? content : [{ type: "paragraph" }] } as NoeudRedaction;
    }
    case "image": {
      const src = typeof attrs.src === "string" ? attrs.src : "";
      const m = IMAGE_DATA.exec(src);
      if (!m) return null; // jamais d'adresse distante : l'image est intégrée au document
      if (Math.floor((m[2].length * 3) / 4) > LIMITES.octetsImageMax) throw new Error("Une image dépasse 1 Mo.");
      if (++c.images > LIMITES.imagesMax) throw new Error(`Maximum ${LIMITES.imagesMax} images par document.`);
      const largeur = entierBorne(attrs.largeur, 10, 100); // en % de la largeur de la page
      const alt = typeof attrs.alt === "string" ? attrs.alt.slice(0, 200) : undefined;
      return { type: "image", attrs: { src, ...(alt ? { alt } : {}), ...(largeur ? { largeur } : {}) } };
    }
    default:
      return null;
  }
}

/**
 * Revalide et nettoie le contenu envoyé par le navigateur. Renvoie le contenu sûr, ou une erreur lisible (document trop
 * gros, trop d'images, image trop lourde). Un document sans aucun bloc reste valide : il devient un paragraphe vide.
 */
export function validerContenu(brut: unknown): { contenu: ContenuRedaction } | { erreur: string } {
  try {
    if (JSON.stringify(brut ?? null).length > LIMITES.octetsJsonMax) return { erreur: "Document trop volumineux (4 Mo maximum, images comprises)." };
    if (!brut || typeof brut !== "object" || (brut as { type?: unknown }).type !== "doc") return { erreur: "Contenu du document invalide." };
    const c: Compteurs = { noeuds: 0, images: 0 };
    const content = nettoyerEnfants((brut as { content?: unknown }).content, 0, c);
    return { contenu: { type: "doc", content: content.length ? content : [{ type: "paragraph" }] } };
  } catch (e) {
    return { erreur: e instanceof Error ? e.message : "Contenu du document invalide." };
  }
}

/** Texte brut d'un contenu (pour les tests, l'aperçu et la recherche) : blocs séparés par un saut de ligne. */
export function texteBrut(contenu: ContenuRedaction): string {
  const lignes: string[] = [];
  const visiter = (n: NoeudRedaction) => {
    if (n.type === "text") return void lignes.push(n.text);
    if (n.type === "hardBreak") return void lignes.push("\n");
    if ("content" in n && n.content) n.content.forEach(visiter);
    if (["paragraph", "heading", "listItem", "tableCell", "tableHeader"].includes(n.type)) lignes.push("\n");
  };
  contenu.content.forEach(visiter);
  return lignes.join("").replace(/\n{2,}/g, "\n").trim();
}
