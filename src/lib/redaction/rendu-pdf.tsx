import { Document, Page, View, Text, Image, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import type { ContenuRedaction, NoeudRedaction, NoeudTexte } from "./contenu";
import { libellePage, margePt, type MiseEnPage } from "./mise-en-page";
import type { IdentiteDocument } from "./identite";

// Couleurs en hexadécimal direct : react-pdf ne comprend pas les variables CSS (même contrainte que src/lib/pdf/).
const TEXTE = "#1c1917";
const GRIS = "#78716c";
const GRIS_CLAIR = "#e7e5e4";
const FOND_ENTETE_TABLEAU = "#f5f5f4";

const styles = StyleSheet.create({
  // Pas de lineHeight sur la page : avec lui, react-pdf perd l'en-tête dynamique des pages suivantes (voir DocumentRedigePDF).
  page: { fontSize: 11, fontFamily: "Helvetica", color: TEXTE },
  paragraphe: { marginBottom: 6, lineHeight: 1.45 },
  titre1: { fontSize: 20, fontFamily: "Helvetica-Bold", marginTop: 12, marginBottom: 8, lineHeight: 1.3 },
  titre2: { fontSize: 16, fontFamily: "Helvetica-Bold", marginTop: 10, marginBottom: 6, lineHeight: 1.3 },
  titre3: { fontSize: 13, fontFamily: "Helvetica-Bold", marginTop: 8, marginBottom: 4, lineHeight: 1.3 },
  citation: { borderLeft: `2px solid ${GRIS_CLAIR}`, paddingLeft: 10, marginVertical: 6, color: GRIS },
  separateur: { height: 1, backgroundColor: GRIS_CLAIR, marginVertical: 10 },
  ligneListe: { flexDirection: "row", marginBottom: 3 },
  puce: { width: 18, lineHeight: 1.45 },
  corpsListe: { flex: 1 },
  tableau: { borderTop: `1px solid ${GRIS_CLAIR}`, borderLeft: `1px solid ${GRIS_CLAIR}`, marginVertical: 8 },
  ligneTableau: { flexDirection: "row" },
  celluleTableau: { borderRight: `1px solid ${GRIS_CLAIR}`, borderBottom: `1px solid ${GRIS_CLAIR}`, padding: 5 },
  // En-tête / pied de page
  entete: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18, paddingBottom: 8 },
  blocIdentite: { flexDirection: "row", alignItems: "flex-start", gap: 8, flexShrink: 1 },
  logo: { width: 38, height: 38, objectFit: "contain" },
  nomEntreprise: { fontSize: 14, fontFamily: "Helvetica-Bold" },
  ligneEntete: { fontSize: 8.5, color: GRIS, marginTop: 1 },
  blocDroite: { alignItems: "flex-end", maxWidth: "45%" },
  piedDePage: { position: "absolute", bottom: 0, left: 0, right: 0 },
  piedTrait: { height: 1.5 },
  piedContenu: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", paddingTop: 6 },
  piedCellule: { flex: 1, fontSize: 8, color: GRIS },
});

/**
 * Fusionne des styles en UN objet. react-pdf perd des éléments (en-tête dynamique des pages suivantes) quand l'arbre contient
 * des tableaux de styles : tous les styles de ce fichier passent donc par cette fonction.
 */
type StyleReactPdf = NonNullable<React.ComponentProps<typeof View>["style"]> & NonNullable<React.ComponentProps<typeof Text>["style"]>;
function fusion(styles: (Record<string, unknown> | undefined | false)[]): StyleReactPdf {
  return Object.assign({}, ...styles.filter(Boolean)) as StyleReactPdf;
}

type StyleMark = "bold" | "italic" | "underline" | "strike";

function policeTexte(marks: StyleMark[]): string {
  const gras = marks.includes("bold");
  const italique = marks.includes("italic");
  if (gras && italique) return "Helvetica-BoldOblique";
  if (gras) return "Helvetica-Bold";
  if (italique) return "Helvetica-Oblique";
  return "Helvetica";
}

function Inline({ noeuds }: { noeuds: NoeudRedaction[] | undefined }) {
  if (!noeuds || noeuds.length === 0) return <Text> </Text>;
  return (
    <>
      {noeuds.map((n, i) => {
        if (n.type === "hardBreak") return <Text key={i}>{"\n"}</Text>;
        if (n.type !== "text") return null;
        const marks = (n as NoeudTexte).marks?.map((m) => m.type) ?? [];
        const decorations = [marks.includes("underline") ? "underline" : "", marks.includes("strike") ? "line-through" : ""].filter(Boolean).join(" ");
        const style = { fontFamily: policeTexte(marks), ...(decorations ? { textDecoration: decorations as "underline" | "line-through" | "underline line-through" } : {}) };
        return (
          <Text key={i} style={style}>
            {n.text}
          </Text>
        );
      })}
    </>
  );
}

function Blocs({ noeuds, niveauListe = 0 }: { noeuds: NoeudRedaction[]; niveauListe?: number }) {
  return (
    <>
      {noeuds.map((n, i) => (
        <Bloc key={i} noeud={n} niveauListe={niveauListe} />
      ))}
    </>
  );
}

function Bloc({ noeud: n, niveauListe }: { noeud: NoeudRedaction; niveauListe: number }) {
  switch (n.type) {
    case "paragraph":
      return (
        <Text style={fusion([styles.paragraphe, { textAlign: n.attrs?.textAlign ?? "left" }])}>
          <Inline noeuds={n.content} />
        </Text>
      );
    case "heading":
      return (
        <Text style={fusion([n.attrs.level === 1 ? styles.titre1 : n.attrs.level === 2 ? styles.titre2 : styles.titre3, { textAlign: n.attrs.textAlign ?? "left" }])} minPresenceAhead={40}>
          <Inline noeuds={n.content} />
        </Text>
      );
    case "bulletList":
    case "orderedList":
      return (
        <View style={{ marginLeft: niveauListe > 0 ? 14 : 0, marginBottom: 4 }}>
          {n.content.map((item, i) => (
            <View key={i} style={styles.ligneListe} wrap={false}>
              <Text style={styles.puce}>{n.type === "orderedList" ? `${i + 1}.` : "•"}</Text>
              <View style={styles.corpsListe}>{item.type === "listItem" ? <Blocs noeuds={item.content} niveauListe={niveauListe + 1} /> : null}</View>
            </View>
          ))}
        </View>
      );
    case "blockquote":
      return (
        <View style={styles.citation}>
          <Blocs noeuds={n.content} niveauListe={niveauListe} />
        </View>
      );
    case "horizontalRule":
      return <View style={styles.separateur} />;
    case "pageBreak":
      return <View break />;
    case "table":
      return (
        <View style={styles.tableau}>
          {n.content.map((ligne, i) =>
            ligne.type === "tableRow" ? (
              <View key={i} style={styles.ligneTableau} wrap={false}>
                {ligne.content.map((cellule, j) => {
                  if (cellule.type !== "tableCell" && cellule.type !== "tableHeader") return null;
                  const entete = cellule.type === "tableHeader";
                  return (
                    <View key={j} style={fusion([styles.celluleTableau, { flexGrow: cellule.attrs?.colspan ?? 1, flexBasis: 0 }, entete ? { backgroundColor: FOND_ENTETE_TABLEAU } : {}])}>
                      {entete ? (
                        <Text style={{ fontFamily: "Helvetica-Bold" }}>
                          <Inline noeuds={cellule.content.flatMap((p) => ("content" in p && p.content ? p.content : []))} />
                        </Text>
                      ) : (
                        <Blocs noeuds={cellule.content} niveauListe={niveauListe} />
                      )}
                    </View>
                  );
                })}
              </View>
            ) : null
          )}
        </View>
      );
    case "image":
      return (
        // eslint-disable-next-line jsx-a11y/alt-text -- Image de @react-pdf/renderer, pas une balise <img> HTML : pas de prop alt
        <Image src={n.attrs.src} style={{ width: `${n.attrs.largeur ?? 60}%`, marginVertical: 6 }} />
      );
    default:
      return null;
  }
}

export type PropsDocumentRedigePDF = {
  titre: string;
  contenu: ContenuRedaction;
  miseEnPage: MiseEnPage;
  identite: IdentiteDocument;
  /** Date d'édition affichée en en-tête si demandé (celle de l'export, jamais figée dans le document). */
  dateEdition: Date;
};

function aUnEntete(m: MiseEnPage): boolean {
  return m.enteteEntreprise || !!m.enteteGauche || !!m.enteteDroite || !!m.reference || m.afficherDate;
}

// Élément créé par `render` (pages suivantes) : react-pdf ne développe ni les fragments, ni les valeurs nulles, ni les tableaux de
// styles de ces éléments ; l'en-tête est donc construit avec des objets de style simples et des listes d'enfants sans trou.
// `compact` : version des pages suivantes, sans logo — les images d'un élément ajouté dynamiquement ne sont pas résolues.
function Entete({ miseEnPage: m, identite, dateEdition, compact = false }: { miseEnPage: MiseEnPage; identite: IdentiteDocument; dateEdition: Date; compact?: boolean }) {
  const coordonnees = [identite.adresse, identite.ville].filter(Boolean).join(", ");
  const legal = [identite.niu ? `NIU ${identite.niu}` : null, identite.rccm ? `RCCM ${identite.rccm}` : null].filter(Boolean).join(" · ");
  const date = m.afficherDate ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(dateEdition) : null;
  const ligne = (cle: string, texte: string, style: Record<string, unknown>) => (
    <Text key={cle} style={{ ...styles.ligneEntete, ...style }}>
      {texte}
    </Text>
  );

  const gauche: React.ReactElement[] = [];
  if (m.enteteEntreprise) {
    gauche.push(
      <Text key="nom" style={{ ...styles.nomEntreprise, color: identite.couleur }}>
        {identite.nom}
      </Text>
    );
    if (identite.groupeNom) gauche.push(ligne("groupe", `Une entreprise du groupe ${identite.groupeNom}`, { color: identite.couleur }));
    if (coordonnees) gauche.push(ligne("coord", coordonnees, {}));
    if (legal) gauche.push(ligne("legal", legal, {}));
  }
  if (m.enteteGauche) gauche.push(ligne("libre", m.enteteGauche, { color: TEXTE, fontSize: 9 }));

  const droite: React.ReactElement[] = [];
  if (m.reference) droite.push(ligne("ref", m.reference, { color: TEXTE, fontSize: 9, fontFamily: "Helvetica-Bold" }));
  if (date) droite.push(ligne("date", date, {}));
  if (m.enteteDroite) droite.push(ligne("libre-d", m.enteteDroite, { textAlign: "right" }));

  const identiteEnfants: React.ReactElement[] = [];
  if (m.enteteEntreprise && identite.logo && !compact) {
    // eslint-disable-next-line jsx-a11y/alt-text -- Image de @react-pdf/renderer, pas une balise <img> HTML : pas de prop alt
    identiteEnfants.push(<Image key="logo" src={{ data: identite.logo.octets, format: identite.logo.format === "jpeg" ? "jpg" : "png" }} style={styles.logo} />);
  }
  identiteEnfants.push(
    <View key="textes" style={{ flexShrink: 1 }}>
      {gauche}
    </View>
  );

  return (
    <View style={{ ...styles.entete, borderBottom: `1.5px solid ${identite.couleur}` }}>
      <View style={styles.blocIdentite}>{identiteEnfants}</View>
      <View style={styles.blocDroite}>{droite}</View>
    </View>
  );
}

function CellulePied({ position, m }: { position: "GAUCHE" | "CENTRE" | "DROITE"; m: MiseEnPage }) {
  const texte = position === "GAUCHE" ? m.piedGauche : position === "CENTRE" ? m.piedCentre : m.piedDroite;
  const alignement = position === "GAUCHE" ? "left" : position === "CENTRE" ? "center" : "right";
  const avecPage = m.numerotation !== "AUCUNE" && m.numerotationPosition === position;
  return (
    <View style={styles.piedCellule}>
      {texte ? <Text style={{ textAlign: alignement }}>{texte}</Text> : null}
      {avecPage ? <Text style={{ textAlign: alignement, marginTop: texte ? 2 : 0 }} render={({ pageNumber, totalPages }) => libellePage(m.numerotation, pageNumber, totalPages)} /> : null}
    </View>
  );
}

function aUnPied(m: MiseEnPage): boolean {
  return m.numerotation !== "AUCUNE" || !!m.piedGauche || !!m.piedCentre || !!m.piedDroite;
}

export function DocumentRedigePDF({ titre, contenu, miseEnPage: m, identite, dateEdition }: PropsDocumentRedigePDF) {
  const marge = margePt(m.marges);
  const pied = aUnPied(m);
  return (
    <Document title={titre} author={identite.nom} creator="Vertex One">
      // Style de page en OBJET simple : avec un tableau de styles, react-pdf perd l'en-tête dynamique des pages suivantes.
      <Page size="A4" style={{ ...styles.page, paddingTop: marge, paddingHorizontal: marge, paddingBottom: marge + (pied ? 34 : 0) }}>
        {aUnEntete(m) ? (
          // L'en-tête est appelé comme une FONCTION (pas comme un composant) : react-pdf ne développe pas un composant React
          // renvoyé par `render`, seulement ses éléments de base (View, Text, Image) — sinon l'en-tête disparaît du PDF.
          m.pagesEntete === "SUIVANTES" ? (
            <View fixed render={({ pageNumber }) => (pageNumber === 1 ? <View /> : Entete({ miseEnPage: m, identite, dateEdition, compact: true }))} />
          ) : m.pagesEntete === "PREMIERE" ? (
            <View>{Entete({ miseEnPage: m, identite, dateEdition })}</View>
          ) : (
            <View fixed>{Entete({ miseEnPage: m, identite, dateEdition })}</View>
          )
        ) : null}
        <Blocs noeuds={contenu.content} />
        {pied ? (
          <View style={{ ...styles.piedDePage, paddingHorizontal: marge, paddingBottom: Math.max(14, marge / 2) }} fixed>
            <View style={{ ...styles.piedTrait, backgroundColor: identite.couleur }} />
            <View style={styles.piedContenu}>
              <CellulePied position="GAUCHE" m={m} />
              <CellulePied position="CENTRE" m={m} />
              <CellulePied position="DROITE" m={m} />
            </View>
          </View>
        ) : null}
      </Page>
    </Document>
  );
}

export function rendreDocumentRedigePDF(props: PropsDocumentRedigePDF): Promise<Buffer> {
  return renderToBuffer(<DocumentRedigePDF {...props} />);
}
