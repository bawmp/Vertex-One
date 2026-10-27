import { Document, Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer";
import type { FichePresence, LignePresence, StatutPresence } from "@/lib/rh/presences";
import { statutEffectif } from "@/lib/rh/presences";

// Couleurs en hexadécimal direct (react-pdf ne comprend pas les variables CSS). L'accent est la couleur de marque de l'entreprise, à défaut le bleu marine Vertex One.
const ACCENT_PAR_DEFAUT = "#233c7e";
const STONE_700 = "#44403c";
const STONE_500 = "#78716c";
const STONE_200 = "#e7e5e4";
const STONE_50 = "#fafaf9";

const COULEUR_STATUT: Record<StatutPresence | "NON", { texte: string; fond: string; libelle: string }> = {
  PRESENT: { texte: "#166534", fond: "#dcfce7", libelle: "Présent" },
  RETARD: { texte: "#92400e", fond: "#fef3c7", libelle: "Retard" },
  ABSENT: { texte: "#991b1b", fond: "#fee2e2", libelle: "Absent" },
  CONGE: { texte: "#1e40af", fond: "#dbeafe", libelle: "Congé" },
  NON: { texte: STONE_500, fond: "#f5f5f4", libelle: "—" },
};

const styles = StyleSheet.create({
  page: { paddingTop: 36, paddingHorizontal: 36, paddingBottom: 64, fontSize: 9.5, fontFamily: "Helvetica", color: "#1c1917" },
  entete: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 },
  logo: { width: 120, height: 46, objectFit: "contain", marginBottom: 6 },
  nomEntreprise: { fontSize: 15, fontWeight: 700 },
  titreDoc: { fontSize: 18, fontWeight: 700, textAlign: "right" },
  dateDoc: { fontSize: 11, color: STONE_700, textAlign: "right", marginTop: 3 },
  blocInfos: { flexDirection: "row", gap: 10, marginBottom: 14 },
  carte: { flex: 1, borderRadius: 4, padding: 8, backgroundColor: STONE_50, border: `1px solid ${STONE_200}` },
  carteValeur: { fontSize: 16, fontWeight: 700 },
  carteLibelle: { fontSize: 8, color: STONE_500, textTransform: "uppercase", marginTop: 1, letterSpacing: 0.4 },
  titreSection: { fontSize: 11, fontWeight: 700, marginTop: 10, marginBottom: 4 },
  ligneEntete: { flexDirection: "row", paddingVertical: 5, paddingHorizontal: 4, color: "#ffffff", fontWeight: 700, fontSize: 8.5 },
  ligne: { flexDirection: "row", paddingVertical: 5, paddingHorizontal: 4, borderBottom: `1px solid ${STONE_200}`, alignItems: "center" },
  colNum: { width: 22, color: STONE_500 },
  colNom: { flex: 3 },
  colPoste: { flex: 2.2, color: STONE_700 },
  colHeure: { width: 42, textAlign: "center" },
  colStatut: { width: 58 },
  colRemarque: { flex: 2.6, color: STONE_700 },
  pastille: { fontSize: 8, paddingVertical: 2, paddingHorizontal: 5, borderRadius: 8, textAlign: "center", fontWeight: 700 },
  signatures: { flexDirection: "row", gap: 24, marginTop: 28 },
  signature: { flex: 1 },
  traitSignature: { borderBottom: `1px solid ${STONE_500}`, height: 36 },
  libelleSignature: { fontSize: 8, color: STONE_500, marginTop: 3 },
  validation: { marginTop: 10, fontSize: 9, color: "#166534" },
  pied: { position: "absolute", bottom: 22, left: 36, right: 36, flexDirection: "row", justifyContent: "space-between", fontSize: 8, color: STONE_500 },
});

export type FichePresencePDFProps = {
  entreprise: { nom: string; logoUrl: string | null; couleurMarque: string | null };
  fiche: FichePresence;
};

const dateLongue = (iso: string) => new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(`${iso}T00:00:00`));
const dateHeure = (d: Date) => new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(d);

function LigneTableau({ numero, l }: { numero: number; l: LignePresence }) {
  const st = statutEffectif(l);
  const c = COULEUR_STATUT[st ?? "NON"];
  return (
    <View style={styles.ligne} wrap={false}>
      <Text style={styles.colNum}>{numero}</Text>
      <Text style={styles.colNom}>{l.nom}</Text>
      <Text style={styles.colPoste}>{l.poste}</Text>
      <Text style={styles.colHeure}>{l.heureArrivee ?? ""}</Text>
      <Text style={styles.colHeure}>{l.heureDepart ?? ""}</Text>
      <View style={styles.colStatut}>
        <Text style={[styles.pastille, { color: c.texte, backgroundColor: c.fond }]}>{c.libelle}</Text>
      </View>
      <Text style={styles.colRemarque}>{l.remarque ?? (st === "CONGE" && !l.statut ? "Congé approuvé" : "")}</Text>
    </View>
  );
}

/** Fiche de présence journalière : en-tête avec le logo, synthèse, un tableau par entreprise, validation et zones de signature. */
export function FichePresencePDF({ entreprise, fiche }: FichePresencePDFProps) {
  const accent = /^#[0-9a-f]{6}$/i.test(entreprise.couleurMarque ?? "") ? (entreprise.couleurMarque as string) : ACCENT_PAR_DEFAUT;
  const t = fiche.totaux;
  const cartes = [
    { v: t.total, l: "Effectif" },
    { v: t.presents, l: "Présents" },
    { v: t.retards, l: "Retards" },
    { v: t.absents, l: "Absents" },
    { v: t.conges, l: "Congés" },
    ...(t.nonRenseignes > 0 ? [{ v: t.nonRenseignes, l: "À renseigner" }] : []),
  ];
  let numero = 0;

  return (
    <Document title={`Fiche de présence — ${fiche.date}`}>
      <Page size="A4" style={styles.page}>
        <View style={styles.entete}>
          <View>
            {entreprise.logoUrl ? <Image src={entreprise.logoUrl} style={styles.logo} /> : null}
            <Text style={styles.nomEntreprise}>{entreprise.nom}</Text>
          </View>
          <View>
            <Text style={[styles.titreDoc, { color: accent }]}>Fiche de présence</Text>
            <Text style={styles.dateDoc}>{dateLongue(fiche.date)}</Text>
            {fiche.gerant ? <Text style={[styles.dateDoc, { fontSize: 9, color: STONE_500 }]}>Gérant : {fiche.gerant.nom}</Text> : null}
          </View>
        </View>

        <View style={styles.blocInfos}>
          {cartes.map((c) => (
            <View key={c.l} style={styles.carte}>
              <Text style={[styles.carteValeur, { color: accent }]}>{c.v}</Text>
              <Text style={styles.carteLibelle}>{c.l}</Text>
            </View>
          ))}
        </View>

        {fiche.sections.map((s) => (
          <View key={s.entrepriseId}>
            {fiche.sections.length > 1 ? <Text style={[styles.titreSection, { color: accent }]}>{s.entrepriseNom}</Text> : null}
            <View style={[styles.ligneEntete, { backgroundColor: accent }]}>
              <Text style={styles.colNum}>N°</Text>
              <Text style={styles.colNom}>Nom</Text>
              <Text style={styles.colPoste}>Poste</Text>
              <Text style={styles.colHeure}>Arrivée</Text>
              <Text style={styles.colHeure}>Départ</Text>
              <Text style={styles.colStatut}>Statut</Text>
              <Text style={styles.colRemarque}>Remarque</Text>
            </View>
            {s.lignes.map((l) => (
              <LigneTableau key={l.dossierRHId} numero={++numero} l={l} />
            ))}
            {s.lignes.length === 0 ? <Text style={{ paddingVertical: 8, color: STONE_500 }}>Aucun employé.</Text> : null}
          </View>
        ))}

        {fiche.validee ? <Text style={styles.validation}>Fiche validée par {fiche.validee.parNom} le {dateHeure(fiche.validee.le)}.</Text> : null}

        <View style={styles.signatures} wrap={false}>
          <View style={styles.signature}>
            <View style={styles.traitSignature} />
            <Text style={styles.libelleSignature}>Le gérant de la fiche{fiche.gerant ? ` — ${fiche.gerant.nom}` : ""}</Text>
          </View>
          <View style={styles.signature}>
            <View style={styles.traitSignature} />
            <Text style={styles.libelleSignature}>L&apos;Administrateur</Text>
          </View>
        </View>

        <View style={styles.pied} fixed>
          <Text>{entreprise.nom} — Document généré par Vertex One</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
