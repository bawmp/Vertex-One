import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  Packer,
  PageBreak,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TabStopType,
  TextRun,
  UnderlineType,
  WidthType,
} from "docx";
import type { ContenuRedaction, NoeudRedaction } from "./contenu";
import { margeMm, margeTwips, type MiseEnPage } from "./mise-en-page";
import { dimensionsImage, octetsDepuisDataUrl, type IdentiteDocument } from "./identite";

const LARGEUR_A4_TWIPS = 11906;
const HAUTEUR_A4_TWIPS = 16838;
const PX_PAR_MM = 3.7795;

const sansCouleur = (hex: string) => hex.replace("#", "").toUpperCase();
const AUCUNE_BORDURE = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" } as const;
const FINE = (couleur: string) => ({ style: BorderStyle.SINGLE, size: 4, color: couleur });

type Contexte = { largeurContentePx: number; instances: { n: number } };

function alignementWord(a: string | undefined) {
  return a === "center" ? AlignmentType.CENTER : a === "right" ? AlignmentType.RIGHT : a === "justify" ? AlignmentType.JUSTIFIED : AlignmentType.LEFT;
}

function morceaux(noeuds: NoeudRedaction[] | undefined, base: { bold?: boolean; italics?: boolean } = {}): TextRun[] {
  const runs: TextRun[] = [];
  for (const n of noeuds ?? []) {
    if (n.type === "hardBreak") runs.push(new TextRun({ break: 1 }));
    else if (n.type === "text") {
      const marks = n.marks?.map((m) => m.type) ?? [];
      runs.push(
        new TextRun({
          text: n.text,
          bold: base.bold || marks.includes("bold"),
          italics: base.italics || marks.includes("italic"),
          underline: marks.includes("underline") ? { type: UnderlineType.SINGLE } : undefined,
          strike: marks.includes("strike"),
        })
      );
    }
  }
  return runs;
}

function blocs(noeuds: NoeudRedaction[], ctx: Contexte, niveauListe = 0, liste?: { reference: string; instance?: number }): (Paragraph | Table)[] {
  const resultat: (Paragraph | Table)[] = [];
  for (const n of noeuds) {
    switch (n.type) {
      case "paragraph":
        resultat.push(
          new Paragraph({
            alignment: alignementWord(n.attrs?.textAlign),
            spacing: { after: 120 },
            children: morceaux(n.content),
            ...(liste ? { numbering: { reference: liste.reference, level: niveauListe - 1, ...(liste.instance !== undefined ? { instance: liste.instance } : {}) } } : {}),
          })
        );
        break;
      case "heading":
        resultat.push(
          new Paragraph({
            heading: n.attrs.level === 1 ? HeadingLevel.HEADING_1 : n.attrs.level === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3,
            alignment: alignementWord(n.attrs.textAlign),
            spacing: { before: 200, after: 120 },
            children: morceaux(n.content, { bold: true }),
          })
        );
        break;
      case "bulletList":
      case "orderedList": {
        const reference = n.type === "bulletList" ? "puces" : "numeros";
        const instance = n.type === "orderedList" ? ++ctx.instances.n : undefined;
        for (const item of n.content) {
          if (item.type !== "listItem") continue;
          // Le premier paragraphe de l'élément porte la puce/le numéro ; les blocs suivants (listes imbriquées, etc.) suivent.
          const [premier, ...suite] = item.content;
          if (premier?.type === "paragraph") resultat.push(...blocs([premier], ctx, niveauListe + 1, { reference, instance }));
          else if (premier) resultat.push(...blocs([premier], ctx, niveauListe + 1));
          if (suite.length) resultat.push(...blocs(suite, ctx, niveauListe + 1));
        }
        break;
      }
      case "blockquote":
        for (const p of blocs(n.content, ctx, niveauListe)) {
          resultat.push(p);
        }
        break;
      case "horizontalRule":
        resultat.push(new Paragraph({ spacing: { before: 120, after: 120 }, border: { bottom: FINE("A8A29E") }, children: [] }));
        break;
      case "pageBreak":
        resultat.push(new Paragraph({ children: [new PageBreak()] }));
        break;
      case "table": {
        const lignes = n.content.filter((l) => l.type === "tableRow");
        const colonnes = Math.max(1, ...lignes.map((l) => ("content" in l ? l.content : []).reduce((s, c) => s + (("attrs" in c && c.attrs && "colspan" in c.attrs && c.attrs.colspan) || 1), 0)));
        const largeurTable = Math.round(ctx.largeurContentePx * 15); // px -> twips (1 px = 15 twips)
        const largeurCol = Math.floor(largeurTable / colonnes);
        resultat.push(
          new Table({
            width: { size: largeurTable, type: WidthType.DXA },
            columnWidths: Array.from({ length: colonnes }, () => largeurCol),
            rows: lignes.map(
              (ligne) =>
                new TableRow({
                  children: ("content" in ligne ? ligne.content : []).flatMap((cellule) => {
                    if (cellule.type !== "tableCell" && cellule.type !== "tableHeader") return [];
                    const entete = cellule.type === "tableHeader";
                    const colspan = cellule.attrs?.colspan ?? 1;
                    const rowspan = cellule.attrs?.rowspan;
                    return [
                      new TableCell({
                        width: { size: largeurCol * colspan, type: WidthType.DXA },
                        columnSpan: colspan > 1 ? colspan : undefined,
                        rowSpan: rowspan && rowspan > 1 ? rowspan : undefined,
                        shading: entete ? { type: ShadingType.CLEAR, fill: "F5F5F4", color: "auto" } : undefined,
                        margins: { top: 60, bottom: 60, left: 100, right: 100 },
                        borders: { top: FINE("D6D3D1"), bottom: FINE("D6D3D1"), left: FINE("D6D3D1"), right: FINE("D6D3D1") },
                        children: entete
                          ? (cellule.content.length ? cellule.content : [{ type: "paragraph" as const }]).map((p) => new Paragraph({ children: morceaux("content" in p ? p.content : undefined, { bold: true }) }))
                          : (blocs(cellule.content, ctx, niveauListe).length ? blocs(cellule.content, ctx, niveauListe) : [new Paragraph({ children: [] })]) as Paragraph[],
                      }),
                    ];
                  }),
                })
            ),
          })
        );
        resultat.push(new Paragraph({ spacing: { after: 80 }, children: [] }));
        break;
      }
      case "image": {
        const img = octetsDepuisDataUrl(n.attrs.src);
        if (!img) break;
        const dims = dimensionsImage(img.octets) ?? { largeur: 4, hauteur: 3 };
        const largeur = Math.max(20, Math.round((ctx.largeurContentePx * (n.attrs.largeur ?? 60)) / 100));
        const hauteur = Math.round((largeur * dims.hauteur) / dims.largeur);
        resultat.push(
          new Paragraph({
            spacing: { before: 80, after: 80 },
            children: [new ImageRun({ type: img.format === "jpeg" ? "jpg" : "png", data: img.octets, transformation: { width: largeur, height: hauteur }, altText: { title: n.attrs.alt ?? "Image", description: n.attrs.alt ?? "Image", name: "image" } })],
          })
        );
        break;
      }
      default:
        break;
    }
  }
  return resultat;
}

function niveauxListe(format: (typeof LevelFormat)[keyof typeof LevelFormat], texte: (n: number) => string) {
  return Array.from({ length: 6 }, (_, niveau) => ({
    level: niveau,
    format,
    text: texte(niveau),
    alignment: AlignmentType.LEFT,
    style: { paragraph: { indent: { left: 540 + niveau * 360, hanging: 270 } } },
  }));
}

function enteteWord(m: MiseEnPage, identite: IdentiteDocument, dateEdition: Date, compact = false): Header {
  const coordonnees = [identite.adresse, identite.ville].filter(Boolean).join(", ");
  const legal = [identite.niu ? `NIU ${identite.niu}` : null, identite.rccm ? `RCCM ${identite.rccm}` : null].filter(Boolean).join(" · ");
  const couleur = sansCouleur(identite.couleur);
  const gauche: Paragraph[] = [];
  if (m.enteteEntreprise) {
    if (identite.logo && !compact) {
      const d = dimensionsImage(identite.logo.octets) ?? { largeur: 1, hauteur: 1 };
      const hauteur = 46;
      gauche.push(new Paragraph({ children: [new ImageRun({ type: identite.logo.format === "jpeg" ? "jpg" : "png", data: identite.logo.octets, transformation: { width: Math.round((hauteur * d.largeur) / d.hauteur), height: hauteur }, altText: { title: "Logo", description: "Logo", name: "logo" } })] }));
    }
    gauche.push(new Paragraph({ children: [new TextRun({ text: identite.nom, bold: true, size: 28, color: couleur })] }));
    if (identite.groupeNom) gauche.push(new Paragraph({ children: [new TextRun({ text: `Une entreprise du groupe ${identite.groupeNom}`, size: 17, color: couleur })] }));
    if (coordonnees) gauche.push(new Paragraph({ children: [new TextRun({ text: coordonnees, size: 17, color: "78716C" })] }));
    if (legal) gauche.push(new Paragraph({ children: [new TextRun({ text: legal, size: 17, color: "78716C" })] }));
  }
  if (m.enteteGauche) gauche.push(new Paragraph({ children: [new TextRun({ text: m.enteteGauche, size: 18 })] }));
  const droite: Paragraph[] = [];
  if (m.reference) droite.push(new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: m.reference, bold: true, size: 18 })] }));
  if (m.afficherDate) droite.push(new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(dateEdition), size: 17, color: "78716C" })] }));
  if (m.enteteDroite) droite.push(new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: m.enteteDroite, size: 17, color: "78716C" })] }));
  const aucune = { top: AUCUNE_BORDURE, bottom: AUCUNE_BORDURE, left: AUCUNE_BORDURE, right: AUCUNE_BORDURE };
  const largeur = LARGEUR_A4_TWIPS - 2 * margeTwips(m.marges);
  return new Header({
    children: [
      new Table({
        width: { size: largeur, type: WidthType.DXA },
        columnWidths: [Math.round(largeur * 0.62), largeur - Math.round(largeur * 0.62)],
        borders: { ...aucune, insideHorizontal: AUCUNE_BORDURE, insideVertical: AUCUNE_BORDURE },
        rows: [
          new TableRow({
            children: [
              new TableCell({ width: { size: Math.round(largeur * 0.62), type: WidthType.DXA }, borders: { ...aucune, bottom: { style: BorderStyle.SINGLE, size: 8, color: couleur } }, children: gauche.length ? gauche : [new Paragraph({ children: [] })] }),
              new TableCell({ width: { size: largeur - Math.round(largeur * 0.62), type: WidthType.DXA }, borders: { ...aucune, bottom: { style: BorderStyle.SINGLE, size: 8, color: couleur } }, children: droite.length ? droite : [new Paragraph({ children: [] })] }),
            ],
          }),
        ],
      }),
      new Paragraph({ children: [] }),
    ],
  });
}

function piedWord(m: MiseEnPage, identite: IdentiteDocument): Footer {
  const largeur = LARGEUR_A4_TWIPS - 2 * margeTwips(m.marges);
  const page = (): TextRun[] =>
    m.numerotation === "AUCUNE"
      ? []
      : m.numerotation === "PAGE"
        ? [new TextRun({ children: ["Page ", PageNumber.CURRENT], size: 16, color: "78716C" })]
        : [new TextRun({ children: ["Page ", PageNumber.CURRENT, " / ", PageNumber.TOTAL_PAGES], size: 16, color: "78716C" })];
  const cellule = (position: "GAUCHE" | "CENTRE" | "DROITE", texte: string): TextRun[] => {
    const runs: TextRun[] = texte ? [new TextRun({ text: texte, size: 16, color: "78716C" })] : [];
    if (m.numerotation !== "AUCUNE" && m.numerotationPosition === position) {
      if (runs.length) runs.push(new TextRun({ text: "  ·  ", size: 16, color: "78716C" }));
      runs.push(...page());
    }
    return runs;
  };
  const G = cellule("GAUCHE", m.piedGauche);
  const C = cellule("CENTRE", m.piedCentre);
  const D = cellule("DROITE", m.piedDroite);
  return new Footer({
    children: [
      new Paragraph({
        border: { top: { style: BorderStyle.SINGLE, size: 6, color: sansCouleur(identite.couleur), space: 4 } },
        tabStops: [
          { type: TabStopType.CENTER, position: Math.round(largeur / 2) },
          { type: TabStopType.RIGHT, position: largeur },
        ],
        children: [...G, new TextRun({ children: ["\t"] }), ...C, new TextRun({ children: ["\t"] }), ...D],
      }),
    ],
  });
}

export type PropsDocumentRedigeDocx = {
  titre: string;
  contenu: ContenuRedaction;
  miseEnPage: MiseEnPage;
  identite: IdentiteDocument;
  dateEdition: Date;
};

export function rendreDocumentRedigeDocx({ titre, contenu, miseEnPage: m, identite, dateEdition }: PropsDocumentRedigeDocx): Promise<Buffer> {
  const marge = margeTwips(m.marges);
  const largeurContentePx = Math.round((210 - 2 * margeMm(m.marges)) * PX_PAR_MM);
  const avecEntete = m.enteteEntreprise || !!m.enteteGauche || !!m.enteteDroite || !!m.reference || m.afficherDate;
  const avecPied = m.numerotation !== "AUCUNE" || !!m.piedGauche || !!m.piedCentre || !!m.piedDroite;
  const doc = new Document({
    creator: identite.nom,
    title: titre,
    description: "Document rédigé avec Vertex One",
    styles: { default: { document: { run: { font: "Calibri", size: 22 } } } },
    numbering: {
      config: [
        { reference: "puces", levels: niveauxListe(LevelFormat.BULLET, (n) => (n % 2 === 0 ? "•" : "–")) },
        { reference: "numeros", levels: niveauxListe(LevelFormat.DECIMAL, (n) => `%${n + 1}.`) },
      ],
    },
    sections: [
      {
        properties: {
          titlePage: m.pagesEntete !== "TOUTES",
          page: { size: { width: LARGEUR_A4_TWIPS, height: HAUTEUR_A4_TWIPS }, margin: { top: marge, right: marge, bottom: marge, left: marge, header: 500, footer: 500 } },
        },
        headers: avecEntete
          ? m.pagesEntete === "TOUTES"
            ? { default: enteteWord(m, identite, dateEdition) }
            : m.pagesEntete === "PREMIERE"
              ? { first: enteteWord(m, identite, dateEdition), default: new Header({ children: [new Paragraph({ children: [] })] }) }
              : { first: new Header({ children: [new Paragraph({ children: [] })] }), default: enteteWord(m, identite, dateEdition, true) }
          : undefined,
        footers: avecPied ? { default: piedWord(m, identite), ...(m.pagesEntete !== "TOUTES" ? { first: piedWord(m, identite) } : {}) } : undefined,
        children: blocs(contenu.content, { largeurContentePx, instances: { n: 0 } }),
      },
    ],
  });
  return Packer.toBuffer(doc);
}
