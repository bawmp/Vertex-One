import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import { formaterFCFAPourPDF } from "@/lib/facturation/calcul";
import type { EtatsFinanciers } from "@/lib/comptabilite/etats-donnees";
import { debutExerciceTexte, finExerciceTexte } from "@/lib/comptabilite/exercice-regles";
import type { SectionEtat } from "@/lib/comptabilite/etats-syscohada";

// Couleurs en hexadécimal direct (react-pdf ne comprend pas les variables CSS) : bleu marine Vertex One.
const MARINE = "#233c7e";
const STONE_700 = "#44403c";
const STONE_500 = "#78716c";
const STONE_200 = "#e7e5e4";
const STONE_50 = "#fafaf9";

const styles = StyleSheet.create({
  page: { paddingTop: 36, paddingHorizontal: 36, paddingBottom: 56, fontSize: 9, fontFamily: "Helvetica", color: "#1c1917" },
  entete: { marginBottom: 14 },
  nom: { fontSize: 15, fontWeight: 700 },
  sousTitre: { fontSize: 9, color: STONE_500, marginTop: 2 },
  titre: { fontSize: 14, fontWeight: 700, color: MARINE, marginTop: 10, marginBottom: 6 },
  periode: { fontSize: 9, color: STONE_700, marginBottom: 8 },
  enteteTableau: { flexDirection: "row", backgroundColor: MARINE, color: "#ffffff", paddingVertical: 4, paddingHorizontal: 4, fontWeight: 700, fontSize: 8 },
  titreSection: { flexDirection: "row", backgroundColor: STONE_50, paddingVertical: 3, paddingHorizontal: 4, fontWeight: 700, borderBottom: `1px solid ${STONE_200}` },
  ligne: { flexDirection: "row", paddingVertical: 3, paddingHorizontal: 4, borderBottom: `1px solid ${STONE_200}` },
  ligneSolde: { flexDirection: "row", paddingVertical: 4, paddingHorizontal: 4, backgroundColor: STONE_50, borderBottom: `1px solid ${STONE_200}`, fontWeight: 700 },
  ligneTotal: { flexDirection: "row", paddingVertical: 4, paddingHorizontal: 4, borderTop: `1.5px solid ${MARINE}`, fontWeight: 700 },
  colCode: { width: 28, color: STONE_500 },
  colLibelle: { flex: 1 },
  colMontant: { width: 78, textAlign: "right" },
  note: { marginTop: 14, fontSize: 7.5, color: STONE_500, lineHeight: 1.4 },
  pied: { position: "absolute", bottom: 22, left: 36, right: 36, flexDirection: "row", justifyContent: "space-between", fontSize: 7.5, color: STONE_500 },
});

const m = (v: number) => (v === 0 ? "" : formaterFCFAPourPDF(v).replace(" FCFA", ""));

function Tableau({ titre, sections, avecAmort, totalLibelle, total }: { titre: string; sections: SectionEtat[]; avecAmort: boolean; totalLibelle: string; total: number }) {
  return (
    <View wrap={false}>
      <Text style={styles.titre}>{titre}</Text>
      <View style={styles.enteteTableau}>
        <Text style={styles.colCode}>Réf.</Text>
        <Text style={styles.colLibelle}>Libellé</Text>
        {avecAmort ? <Text style={styles.colMontant}>Brut</Text> : null}
        {avecAmort ? <Text style={styles.colMontant}>Amort.</Text> : null}
        <Text style={styles.colMontant}>{avecAmort ? "Net" : "Montant"}</Text>
      </View>
      {sections.map((s) => (
        <View key={s.titre}>
          <View style={styles.titreSection}>
            <Text style={styles.colCode} />
            <Text style={styles.colLibelle}>{s.titre.toUpperCase()}</Text>
          </View>
          {s.lignes.map((l) => (
            <View key={l.code} style={styles.ligne}>
              <Text style={styles.colCode}>{l.code}</Text>
              <Text style={styles.colLibelle}>{l.libelle}</Text>
              {avecAmort ? <Text style={styles.colMontant}>{m(l.brut)}</Text> : null}
              {avecAmort ? <Text style={styles.colMontant}>{m(l.amort)}</Text> : null}
              <Text style={styles.colMontant}>{m(l.net)}</Text>
            </View>
          ))}
          <View style={styles.ligneSolde}>
            <Text style={styles.colCode} />
            <Text style={styles.colLibelle}>Total {s.titre.toLowerCase()}</Text>
            {avecAmort ? <Text style={styles.colMontant}>{m(s.total.brut)}</Text> : null}
            {avecAmort ? <Text style={styles.colMontant}>{m(s.total.amort)}</Text> : null}
            <Text style={styles.colMontant}>{m(s.total.net)}</Text>
          </View>
        </View>
      ))}
      <View style={styles.ligneTotal}>
        <Text style={styles.colCode} />
        <Text style={styles.colLibelle}>{totalLibelle}</Text>
        <Text style={styles.colMontant}>{formaterFCFAPourPDF(total).replace(" FCFA", "")}</Text>
      </View>
    </View>
  );
}

const NOTE = "États générés automatiquement par Vertex One à partir des écritures de l'entreprise, présentés par rubriques SYSCOHADA. Brouillon à faire valider par votre comptable avant tout dépôt auprès de l'administration : ce document n'est ni la liasse fiscale complète (annexes, tableau des flux de trésorerie) ni une télédéclaration. Montants en francs CFA.";

export function EtatsFinanciersPDF({ etats, genereLe }: { etats: EtatsFinanciers; genereLe: Date }) {
  const { bilan, resultat, entreprise, annee, moisDebut } = etats;
  const debut = debutExerciceTexte(annee, moisDebut);
  const fin = finExerciceTexte(annee, moisDebut);
  const ident = [entreprise.niu ? `NIU ${entreprise.niu}` : null, [entreprise.adresse, entreprise.ville].filter(Boolean).join(", ") || null].filter(Boolean).join(" · ");
  const date = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeZone: "Africa/Douala" }).format(genereLe);
  const pied = (
    <View style={styles.pied} fixed>
      <Text>{entreprise.nom} — États financiers {annee}</Text>
      <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} / ${totalPages}`} />
    </View>
  );
  return (
    <Document title={`Etats financiers ${annee} — ${entreprise.nom}`} author="Vertex One">
      <Page size="A4" style={styles.page}>
        <View style={styles.entete}>
          <Text style={styles.nom}>{entreprise.nom}</Text>
          {ident ? <Text style={styles.sousTitre}>{ident}</Text> : null}
        </View>
        <Text style={styles.periode}>Exercice du {debut} au {fin} — édité le {date}</Text>
        <Tableau titre={`BILAN — ACTIF au ${fin}`} sections={bilan.actif} avecAmort totalLibelle="TOTAL ACTIF" total={bilan.totalActif} />
        <Tableau titre={`BILAN — PASSIF au ${fin}`} sections={bilan.passif} avecAmort={false} totalLibelle="TOTAL PASSIF" total={bilan.totalPassif} />
        {bilan.equilibre ? null : <Text style={{ ...styles.note, color: "#991b1b" }}>Attention : l&apos;actif et le passif ne s&apos;équilibrent pas. Faites vérifier vos écritures.</Text>}
        {pied}
      </Page>
      <Page size="A4" style={styles.page}>
        <View style={styles.entete}>
          <Text style={styles.nom}>{entreprise.nom}</Text>
          {ident ? <Text style={styles.sousTitre}>{ident}</Text> : null}
        </View>
        <Text style={styles.titre}>COMPTE DE RÉSULTAT — exercice {annee}</Text>
        <View style={styles.enteteTableau}>
          <Text style={styles.colCode}>Réf.</Text>
          <Text style={styles.colLibelle}>Libellé</Text>
          <Text style={styles.colMontant}>Montant</Text>
        </View>
        {resultat.lignes.map((l) => (
          <View key={l.code} style={l.solde ? styles.ligneSolde : styles.ligne}>
            <Text style={styles.colCode}>{l.code}</Text>
            <Text style={styles.colLibelle}>{l.libelle}</Text>
            <Text style={styles.colMontant}>{formaterFCFAPourPDF(l.montant).replace(" FCFA", "")}</Text>
          </View>
        ))}
        <Text style={styles.note}>{NOTE}</Text>
        {pied}
      </Page>
    </Document>
  );
}
