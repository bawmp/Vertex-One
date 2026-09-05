import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import { formaterFCFA } from "@/lib/facturation/calcul";

// Couleurs alignées sur la palette de marque (globals.css) — valeurs
// hexadécimales directes, react-pdf ne comprend pas les variables CSS/oklch.
const EMERALD_700 = "#047857";
const EMERALD_50 = "#ecfdf5";
const STONE_500 = "#78716c";
const STONE_200 = "#e7e5e4";

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: "Helvetica", color: "#1c1917" },
  entete: { flexDirection: "row", justifyContent: "space-between", marginBottom: 24 },
  nomEntreprise: { fontSize: 16, fontWeight: 700, color: EMERALD_700 },
  typeDocument: { fontSize: 20, fontWeight: 700, textAlign: "right" },
  numero: { fontSize: 11, color: STONE_500, textAlign: "right", marginTop: 4 },
  blocInfos: { flexDirection: "row", justifyContent: "space-between", marginBottom: 24, gap: 24 },
  colonne: { flex: 1 },
  libelleColonne: { fontSize: 8, textTransform: "uppercase", color: STONE_500, marginBottom: 4, letterSpacing: 0.5 },
  ligneTexte: { marginBottom: 2 },
  tableau: { borderTop: `1px solid ${STONE_200}`, marginTop: 8 },
  ligneTableauEntete: {
    flexDirection: "row",
    backgroundColor: EMERALD_50,
    paddingVertical: 6,
    paddingHorizontal: 4,
    fontWeight: 700,
    fontSize: 9,
  },
  ligneTableau: {
    flexDirection: "row",
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderBottom: `1px solid ${STONE_200}`,
  },
  colDesignation: { flex: 3 },
  colQuantite: { flex: 1, textAlign: "right" },
  colPrixUnitaire: { flex: 1.5, textAlign: "right" },
  colTVA: { flex: 1, textAlign: "right" },
  colTotal: { flex: 1.5, textAlign: "right" },
  blocTotaux: { alignItems: "flex-end", marginTop: 16 },
  ligneTotal: { flexDirection: "row", width: 220, justifyContent: "space-between", paddingVertical: 2 },
  ligneTotalFinal: {
    flexDirection: "row",
    width: 220,
    justifyContent: "space-between",
    paddingVertical: 6,
    marginTop: 4,
    borderTop: `1px solid ${STONE_200}`,
    fontWeight: 700,
    fontSize: 12,
  },
  piedDePage: { position: "absolute", bottom: 30, left: 40, right: 40, fontSize: 8, color: STONE_500, textAlign: "center" },
});

export type LigneAffichagePDF = { designation: string; quantite: number; prixUnitaire: number; tauxTVA: number };

export type DocumentCommercialProps = {
  typeDocument: "DEVIS" | "FACTURE";
  numero: string;
  dateEmission: Date;
  dateEcheanceOuValidite: Date;
  labelDateSecondaire: string;
  entreprise: {
    nom: string;
    niu: string | null;
    rccm: string | null;
    adresse: string | null;
    ville: string | null;
    assujettiTVA: boolean;
  };
  client: {
    nom: string;
    societeCliente: string | null;
    niu: string | null;
    telephone: string;
    email: string | null;
  };
  lignes: LigneAffichagePDF[];
  montantHT: number;
  montantTVA: number;
  montantTTC: number;
};

function formaterDate(date: Date): string {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(date);
}

/**
 * Un seul composant pour devis et facture — mêmes mentions légales
 * (docs/palier-1-*, section 2), même mise en page, seuls le libellé
 * d'en-tête et le nom de la seconde date diffèrent.
 */
export function DocumentCommercialPDF({
  typeDocument,
  numero,
  dateEmission,
  dateEcheanceOuValidite,
  labelDateSecondaire,
  entreprise,
  client,
  lignes,
  montantHT,
  montantTVA,
  montantTTC,
}: DocumentCommercialProps) {
  return (
    <Document title={`${typeDocument} ${numero}`}>
      <Page size="A4" style={styles.page}>
        <View style={styles.entete}>
          <View>
            <Text style={styles.nomEntreprise}>{entreprise.nom}</Text>
            {entreprise.adresse ? <Text style={styles.ligneTexte}>{entreprise.adresse}</Text> : null}
            {entreprise.ville ? <Text style={styles.ligneTexte}>{entreprise.ville}</Text> : null}
            {entreprise.niu ? <Text style={styles.ligneTexte}>NIU : {entreprise.niu}</Text> : null}
            {entreprise.rccm ? <Text style={styles.ligneTexte}>RCCM : {entreprise.rccm}</Text> : null}
          </View>
          <View>
            <Text style={styles.typeDocument}>{typeDocument === "DEVIS" ? "DEVIS" : "FACTURE"}</Text>
            <Text style={styles.numero}>{numero}</Text>
          </View>
        </View>

        <View style={styles.blocInfos}>
          <View style={styles.colonne}>
            <Text style={styles.libelleColonne}>Client</Text>
            <Text style={styles.ligneTexte}>{client.nom}</Text>
            {client.societeCliente ? <Text style={styles.ligneTexte}>{client.societeCliente}</Text> : null}
            {client.niu ? <Text style={styles.ligneTexte}>NIU : {client.niu}</Text> : null}
            <Text style={styles.ligneTexte}>{client.telephone}</Text>
            {client.email ? <Text style={styles.ligneTexte}>{client.email}</Text> : null}
          </View>
          <View style={styles.colonne}>
            <Text style={styles.libelleColonne}>Date d&apos;émission</Text>
            <Text style={styles.ligneTexte}>{formaterDate(dateEmission)}</Text>
            <Text style={[styles.libelleColonne, { marginTop: 10 }]}>{labelDateSecondaire}</Text>
            <Text style={styles.ligneTexte}>{formaterDate(dateEcheanceOuValidite)}</Text>
          </View>
        </View>

        <View style={styles.tableau}>
          <View style={styles.ligneTableauEntete}>
            <Text style={styles.colDesignation}>Désignation</Text>
            <Text style={styles.colQuantite}>Qté</Text>
            <Text style={styles.colPrixUnitaire}>Prix unit.</Text>
            <Text style={styles.colTVA}>TVA</Text>
            <Text style={styles.colTotal}>Total HT</Text>
          </View>
          {lignes.map((ligne, index) => (
            <View key={index} style={styles.ligneTableau}>
              <Text style={styles.colDesignation}>{ligne.designation}</Text>
              <Text style={styles.colQuantite}>{ligne.quantite}</Text>
              <Text style={styles.colPrixUnitaire}>{formaterFCFA(ligne.prixUnitaire)}</Text>
              <Text style={styles.colTVA}>{entreprise.assujettiTVA ? `${ligne.tauxTVA}%` : "N/A"}</Text>
              <Text style={styles.colTotal}>{formaterFCFA(Math.round(ligne.quantite * ligne.prixUnitaire))}</Text>
            </View>
          ))}
        </View>

        <View style={styles.blocTotaux}>
          <View style={styles.ligneTotal}>
            <Text>Total HT</Text>
            <Text>{formaterFCFA(montantHT)}</Text>
          </View>
          <View style={styles.ligneTotal}>
            <Text>{entreprise.assujettiTVA ? "TVA" : "TVA non applicable"}</Text>
            <Text>{entreprise.assujettiTVA ? formaterFCFA(montantTVA) : "—"}</Text>
          </View>
          <View style={styles.ligneTotalFinal}>
            <Text>Total TTC</Text>
            <Text>{formaterFCFA(montantTTC)}</Text>
          </View>
        </View>

        <Text style={styles.piedDePage} fixed>
          {entreprise.nom}
          {entreprise.niu ? ` — NIU ${entreprise.niu}` : ""}
          {entreprise.rccm ? ` — RCCM ${entreprise.rccm}` : ""} — Document généré par Vertex One
        </Text>
      </Page>
    </Document>
  );
}
