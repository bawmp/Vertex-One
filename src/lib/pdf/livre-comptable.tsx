import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";

// Couleurs en hexadécimal direct (react-pdf ne lit pas les variables CSS) : charte Vertex One.
const MARINE = "#233c7e";
const STONE_500 = "#78716c";
const STONE_200 = "#e7e5e4";
const STONE_50 = "#fafaf9";

const styles = StyleSheet.create({
  page: { paddingTop: 32, paddingHorizontal: 30, paddingBottom: 50, fontSize: 8, fontFamily: "Helvetica", color: "#1c1917" },
  nom: { fontSize: 14, fontWeight: 700 },
  sousTitre: { fontSize: 8.5, color: STONE_500, marginTop: 2 },
  titre: { fontSize: 13, fontWeight: 700, color: MARINE, marginTop: 10 },
  periode: { fontSize: 8.5, color: STONE_500, marginBottom: 8, marginTop: 2 },
  entete: { flexDirection: "row", backgroundColor: MARINE, color: "#ffffff", paddingVertical: 4, paddingHorizontal: 3, fontWeight: 700 },
  ligne: { flexDirection: "row", paddingVertical: 2.5, paddingHorizontal: 3, borderBottom: `1px solid ${STONE_200}` },
  ligneTotal: { flexDirection: "row", paddingVertical: 3, paddingHorizontal: 3, backgroundColor: STONE_50, borderBottom: `1px solid ${STONE_200}`, fontWeight: 700 },
  note: { marginTop: 12, fontSize: 7, color: STONE_500, lineHeight: 1.4 },
  pied: { position: "absolute", bottom: 20, left: 30, right: 30, flexDirection: "row", justifyContent: "space-between", fontSize: 7, color: STONE_500 },
});

/** Colonnes qui restent à gauche même si leur contenu est un nombre (numéros de compte). */
const IDENTIFIANTS = /^(compte|journal|date|libell|intitul|document|lettrage|rubrique|client|fournisseur)/i;

/** Règle pure : quelles colonnes sont des montants (alignées à droite, séparées par milliers) ? */
export function colonnesMontant(entetes: string[], lignes: string[][]): boolean[] {
  return entetes.map((e, i) => {
    if (IDENTIFIANTS.test(e)) return false;
    const valeurs = lignes.map((l) => l[i] ?? "").filter((v) => v !== "");
    return valeurs.length > 0 && valeurs.every((v) => /^-?\d+$/.test(v));
  });
}

/** Règle pure : « 1234567 » devient « 1 234 567 » (espace insécable fine, lisible en PDF). */
export function montantLisible(v: string): string {
  if (!/^-?\d+$/.test(v)) return v;
  const negatif = v.startsWith("-");
  const chiffres = negatif ? v.slice(1) : v;
  return (negatif ? "-" : "") + chiffres.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/** Largeurs relatives : les libellés prennent la place, les montants et dates restent étroits. */
export function poidsColonnes(entetes: string[], montants: boolean[]): number[] {
  return entetes.map((e, i) => (montants[i] ? 1.1 : /^date/i.test(e) ? 0.9 : /^(libell|intitul|client|fournisseur)/i.test(e) ? 3 : /^compte/i.test(e) ? 0.9 : 1.2));
}

export type LivrePDFProps = {
  titre: string;
  entreprise: { nom: string; niu: string | null };
  periode: string;
  entetes: string[];
  lignes: string[][];
  genereLe: Date;
};

/** Un livre ou une déclaration quelconque en PDF, depuis le même tableau que l'export CSV : jamais deux calculs différents. */
export function LivreComptablePDF({ titre, entreprise, periode, entetes, lignes, genereLe }: LivrePDFProps) {
  const montants = colonnesMontant(entetes, lignes);
  const poids = poidsColonnes(entetes, montants);
  const date = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeZone: "Africa/Douala" }).format(genereLe);
  const largeur = (i: number) => ({ flex: poids[i] });
  const total = (ligne: string[]) => ligne.some((c) => /^(total|solde reporté)/i.test(c));
  return (
    <Document title={`${titre} — ${entreprise.nom}`} author="Vertex One">
      <Page size="A4" orientation={entetes.length > 6 ? "landscape" : "portrait"} style={styles.page}>
        <Text style={styles.nom}>{entreprise.nom}</Text>
        {entreprise.niu ? <Text style={styles.sousTitre}>NIU {entreprise.niu}</Text> : null}
        <Text style={styles.titre}>{titre}</Text>
        <Text style={styles.periode}>{periode} — édité le {date}</Text>
        <View style={styles.entete} fixed>
          {entetes.map((e, i) => (
            <Text key={i} style={{ ...largeur(i), textAlign: montants[i] ? "right" : "left", paddingHorizontal: 2 }}>{e}</Text>
          ))}
        </View>
        {lignes.map((l, k) => (
          <View key={k} style={total(l) ? styles.ligneTotal : styles.ligne} wrap={false}>
            {entetes.map((_, i) => (
              <Text key={i} style={{ ...largeur(i), textAlign: montants[i] ? "right" : "left", paddingHorizontal: 2 }}>{montants[i] ? montantLisible(l[i] ?? "") : (l[i] ?? "")}</Text>
            ))}
          </View>
        ))}
        {lignes.length === 0 ? <Text style={styles.note}>Aucune écriture sur cette période.</Text> : null}
        <Text style={styles.note}>Document généré automatiquement par Vertex One à partir des écritures de l&apos;entreprise. Montants en francs CFA. À faire valider par votre comptable avant tout dépôt auprès de l&apos;administration.</Text>
        <View style={styles.pied} fixed>
          <Text>{entreprise.nom} — {titre}</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
