import { Document, Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer";
import { formaterFCFA } from "@/lib/facturation/calcul";

/**
 * Reçu émis par VERTEX ONE lui-même vers un tenant qui paie son abonnement — sens inverse de
 * document-commercial.tsx (un tenant vers SON client). Gabarit dédié, volontairement minimal (un seul montant, pas
 * de lignes/TVA) plutôt que de forcer document-commercial.tsx dans un usage qui ne lui correspond pas. Logo Vertex
 * One en filigrane (2026-09-23, demande explicite) : le Buffer est récupéré en amont par rendreRecuAbonnementPDF()
 * (rendu.tsx) — ce composant reste pur/synchrone, comme l'exige @react-pdf/renderer.
 */
const STONE_500 = "#78716c";
const STONE_200 = "#e7e5e4";
const MARQUE_BLEU = "#233c7e";

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: "Helvetica", color: "#1c1917" },
  filigrane: { position: "absolute", top: "32%", left: "18%", width: 260, height: 260, opacity: 0.06 },
  entete: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28 },
  logo: { width: 36, height: 36, objectFit: "contain" },
  blocIdentite: { flexDirection: "row", alignItems: "center", gap: 10 },
  nomEmetteur: { fontSize: 15, fontWeight: 700, color: MARQUE_BLEU },
  typeDocument: { fontSize: 18, fontWeight: 700, textAlign: "right", color: MARQUE_BLEU },
  reference: { fontSize: 10, color: STONE_500, textAlign: "right", marginTop: 4 },
  blocInfos: { flexDirection: "row", justifyContent: "space-between", marginBottom: 24, gap: 24 },
  colonne: { flex: 1 },
  libelleColonne: { fontSize: 8, textTransform: "uppercase", color: STONE_500, marginBottom: 4, letterSpacing: 0.5 },
  valeur: { fontSize: 11 },
  tableau: { borderTop: `1px solid ${STONE_200}`, marginTop: 8 },
  ligneTableauEntete: { flexDirection: "row", paddingVertical: 6, paddingHorizontal: 4, fontWeight: 700, fontSize: 9 },
  ligneTableau: { flexDirection: "row", paddingVertical: 8, paddingHorizontal: 4, borderBottom: `1px solid ${STONE_200}` },
  colDesignation: { flex: 3 },
  colMontant: { flex: 1, textAlign: "right" },
  blocTotal: { flexDirection: "row", justifyContent: "flex-end", marginTop: 16 },
  total: { fontSize: 13, fontWeight: 700, color: MARQUE_BLEU },
  pied: { position: "absolute", bottom: 32, left: 40, right: 40, fontSize: 8, color: STONE_500, textAlign: "center" },
});

export type RecuAbonnementProps = {
  reference: string; // id de la tentative de paiement — unique, jamais un numéro de série dédié (pas un document fiscal)
  nomEntreprisePayeuse: string;
  montant: number; // FCFA
  moyenPaiement: string; // ex. "Mobile Money (Orange)"
  dateConfirmation: Date;
  logo?: Buffer | null; // absent si le téléchargement du logo a échoué — le reçu reste utilisable, juste sans filigrane/en-tête
};

export function RecuAbonnementPDF({ reference, nomEntreprisePayeuse, montant, moyenPaiement, dateConfirmation, logo }: RecuAbonnementProps) {
  const dateFormatee = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(dateConfirmation);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {logo ? (
          // eslint-disable-next-line jsx-a11y/alt-text -- Image de @react-pdf/renderer, pas une balise <img> HTML : pas de prop alt
          <Image src={logo} style={styles.filigrane} fixed />
        ) : null}

        <View style={styles.entete}>
          <View style={styles.blocIdentite}>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- Image de @react-pdf/renderer, pas une balise <img> HTML : pas de prop alt */}
            {logo ? <Image src={logo} style={styles.logo} /> : null}
            <Text style={styles.nomEmetteur}>Vertex One</Text>
          </View>
          <View>
            <Text style={styles.typeDocument}>Reçu de paiement</Text>
            <Text style={styles.reference}>Référence {reference}</Text>
          </View>
        </View>

        <View style={styles.blocInfos}>
          <View style={styles.colonne}>
            <Text style={styles.libelleColonne}>Payé par</Text>
            <Text style={styles.valeur}>{nomEntreprisePayeuse}</Text>
          </View>
          <View style={styles.colonne}>
            <Text style={styles.libelleColonne}>Date</Text>
            <Text style={styles.valeur}>{dateFormatee}</Text>
          </View>
          <View style={styles.colonne}>
            <Text style={styles.libelleColonne}>Moyen de paiement</Text>
            <Text style={styles.valeur}>{moyenPaiement}</Text>
          </View>
        </View>

        <View style={styles.tableau}>
          <View style={styles.ligneTableauEntete}>
            <Text style={styles.colDesignation}>Désignation</Text>
            <Text style={styles.colMontant}>Montant</Text>
          </View>
          <View style={styles.ligneTableau}>
            <Text style={styles.colDesignation}>Abonnement Vertex One — renouvellement mensuel</Text>
            <Text style={styles.colMontant}>{formaterFCFA(montant)}</Text>
          </View>
        </View>

        <View style={styles.blocTotal}>
          <Text style={styles.total}>Total payé : {formaterFCFA(montant)}</Text>
        </View>

        <Text style={styles.pied} fixed>
          Vertex One — reçu généré automatiquement à la confirmation du paiement, ne constitue pas une facture fiscale.
        </Text>
      </Page>
    </Document>
  );
}
