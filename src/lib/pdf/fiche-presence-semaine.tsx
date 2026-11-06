import { Document, Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer";
import type { FicheSemaine, CelluleSemaine } from "@/lib/rh/presences-semaine";
import { semaineDuMois, type StatutPresence } from "@/lib/rh/presences-commun";

// Couleurs en hexadécimal direct (react-pdf ne comprend pas les variables CSS). L'accent est la couleur de marque de l'entreprise.
const ACCENT_PAR_DEFAUT = "#233c7e";
const STONE_700 = "#44403c";
const STONE_500 = "#78716c";
const STONE_200 = "#e7e5e4";
const STONE_50 = "#fafaf9";

const STATUT: Record<StatutPresence, { texte: string; fond: string; lettre: string }> = {
  PRESENT: { texte: "#166534", fond: "#dcfce7", lettre: "P" },
  RETARD: { texte: "#92400e", fond: "#fef3c7", lettre: "R" },
  ABSENT: { texte: "#991b1b", fond: "#fee2e2", lettre: "A" },
  CONGE: { texte: "#1e40af", fond: "#dbeafe", lettre: "C" },
};

const styles = StyleSheet.create({
  page: { paddingTop: 30, paddingHorizontal: 30, paddingBottom: 56, fontSize: 9, fontFamily: "Helvetica", color: "#1c1917" },
  entete: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 },
  logo: { width: 110, height: 40, objectFit: "contain", marginBottom: 4 },
  nomEntreprise: { fontSize: 14, fontWeight: 700 },
  titreDoc: { fontSize: 18, fontWeight: 700, textAlign: "right" },
  sousTitre: { fontSize: 11, color: STONE_700, textAlign: "right", marginTop: 3 },
  blocInfos: { flexDirection: "row", gap: 8, marginBottom: 10 },
  carte: { flex: 1, borderRadius: 4, padding: 6, backgroundColor: STONE_50, border: `1px solid ${STONE_200}` },
  carteValeur: { fontSize: 14, fontWeight: 700 },
  carteLibelle: { fontSize: 7.5, color: STONE_500, textTransform: "uppercase", marginTop: 1 },
  titreSection: { fontSize: 11, fontWeight: 700, marginTop: 8, marginBottom: 4 },
  ligneEntete: { flexDirection: "row", paddingVertical: 4, paddingHorizontal: 4, color: "#ffffff", fontWeight: 700, fontSize: 8.5, alignItems: "center" },
  ligne: { flexDirection: "row", paddingVertical: 4, paddingHorizontal: 4, borderBottom: `1px solid ${STONE_200}`, alignItems: "center" },
  colNum: { width: 20, color: STONE_500 },
  colNom: { width: 130 },
  colJour: { flex: 1, alignItems: "center" },
  colTotal: { width: 28, textAlign: "center" },
  colMois: { width: 28, textAlign: "center", fontWeight: 700 },
  separateur: { borderLeft: "1px solid #d6d3d1", marginLeft: 4, paddingLeft: 4, flexDirection: "row" },
  pastille: { fontSize: 8, width: 18, paddingVertical: 1.5, borderRadius: 8, textAlign: "center", fontWeight: 700 },
  heures: { fontSize: 6.5, color: STONE_500, marginTop: 1 },
  legende: { flexDirection: "row", gap: 14, marginTop: 8, fontSize: 8, color: STONE_700 },
  signatures: { flexDirection: "row", gap: 24, marginTop: 22 },
  signature: { flex: 1 },
  traitSignature: { borderBottom: `1px solid ${STONE_500}`, height: 30 },
  libelleSignature: { fontSize: 8, color: STONE_500, marginTop: 3 },
  pied: { position: "absolute", bottom: 20, left: 30, right: 30, flexDirection: "row", justifyContent: "space-between", fontSize: 8, color: STONE_500 },
});

export type FichePresenceSemainePDFProps = {
  entreprise: { nom: string; logoUrl: string | null; couleurMarque: string | null };
  fiche: FicheSemaine;
};

const fmt = (iso: string, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("fr-FR", options).format(new Date(`${iso}T00:00:00`));

function Cellule({ c }: { c: CelluleSemaine }) {
  if (!c.statut) return <View style={styles.colJour} />;
  const s = STATUT[c.statut];
  const avecHeures = (c.statut === "PRESENT" || c.statut === "RETARD") && (c.heureArrivee || c.heureDepart);
  return (
    <View style={styles.colJour}>
      <Text style={[styles.pastille, { color: s.texte, backgroundColor: s.fond }]}>{s.lettre}</Text>
      {avecHeures ? <Text style={styles.heures}>{`${c.heureArrivee ?? "…"}–${c.heureDepart ?? "…"}`}</Text> : null}
    </View>
  );
}

/** Fiche de présence de la semaine (lundi → dimanche) : un tableau par entreprise, une colonne par jour, totaux de la semaine et signatures. */
export function FichePresenceSemainePDF({ entreprise, fiche }: FichePresenceSemainePDFProps) {
  const accent = /^#[0-9a-f]{6}$/i.test(entreprise.couleurMarque ?? "") ? (entreprise.couleurMarque as string) : ACCENT_PAR_DEFAUT;
  const debut = fiche.jours[0];
  const fin = fiche.jours[6];
  const { mois, annee, numero } = semaineDuMois(debut);
  const nomMois = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" }).format(new Date(annee, mois, 1));
  const t = fiche.totaux;
  const cartes = [
    { v: t.effectif, l: "Effectif" },
    { v: t.presents, l: "Jours présents" },
    { v: t.retards, l: "Retards" },
    { v: t.absents, l: "Absences" },
    { v: t.conges, l: "Jours de congé" },
  ];
  let numeroLigne = 0;

  return (
    <Document title={`Fiche de présence — semaine du ${debut}`}>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <View style={styles.entete}>
          <View>
            {entreprise.logoUrl ? <Image src={entreprise.logoUrl} style={styles.logo} /> : null}
            <Text style={styles.nomEntreprise}>{entreprise.nom}</Text>
          </View>
          <View>
            <Text style={[styles.titreDoc, { color: accent }]}>{`Fiche de présence — Semaine ${numero} de ${nomMois}`}</Text>
            <Text style={styles.sousTitre}>{`Du ${fmt(debut, { weekday: "long", day: "numeric", month: "long" })} au ${fmt(fin, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}`}</Text>
            {fiche.gerant ? <Text style={[styles.sousTitre, { fontSize: 9, color: STONE_500 }]}>Gérant : {fiche.gerant.nom}</Text> : null}
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
            <View style={[styles.ligneEntete, { backgroundColor: accent }]} wrap={false}>
              <Text style={styles.colNum}>N°</Text>
              <Text style={styles.colNom}>Nom</Text>
              {fiche.jours.map((j) => (
                <View key={j} style={styles.colJour}>
                  <Text style={{ textTransform: "capitalize" }}>{fmt(j, { weekday: "short" })}</Text>
                  <Text style={{ fontSize: 7, fontWeight: 400 }}>{fmt(j, { day: "numeric", month: "short" })}</Text>
                </View>
              ))}
              <Text style={styles.colTotal}>Prés.</Text>
              <Text style={styles.colTotal}>Abs.</Text>
              <Text style={styles.colTotal}>Cgé</Text>
              <View style={styles.separateur}>
                <Text style={styles.colMois}>Prés.</Text>
                <Text style={styles.colMois}>Ret.</Text>
                <Text style={styles.colMois}>Abs.</Text>
                <Text style={styles.colMois}>Cgé</Text>
                <Text style={styles.colMois}>N.R.</Text>
              </View>
            </View>
            {s.lignes.map((l) => (
              <View key={l.dossierRHId} style={styles.ligne} wrap={false}>
                <Text style={styles.colNum}>{++numeroLigne}</Text>
                <View style={styles.colNom}>
                  <Text>{l.nom}</Text>
                  <Text style={{ fontSize: 7, color: STONE_500 }}>{l.poste}</Text>
                </View>
                {l.cellules.map((c, i) => (
                  <Cellule key={fiche.jours[i]} c={c} />
                ))}
                <Text style={styles.colTotal}>{l.presents + l.retards}</Text>
                <Text style={styles.colTotal}>{l.absents}</Text>
                <Text style={styles.colTotal}>{l.conges}</Text>
                <View style={styles.separateur}>
                  <Text style={styles.colMois}>{l.cumul.presents}</Text>
                  <Text style={[styles.colMois, l.cumul.retards > 0 ? { color: STATUT.RETARD.texte } : {}]}>{l.cumul.retards}</Text>
                  <Text style={[styles.colMois, l.cumul.absents > 0 ? { color: STATUT.ABSENT.texte } : {}]}>{l.cumul.absents}</Text>
                  <Text style={styles.colMois}>{l.cumul.conges}</Text>
                  <Text style={[styles.colMois, { color: STONE_500 }]}>{l.cumul.nonRenseignes}</Text>
                </View>
              </View>
            ))}
            {s.lignes.length === 0 ? <Text style={{ paddingVertical: 8, color: STONE_500 }}>Aucun employé.</Text> : null}
          </View>
        ))}

        <View style={styles.legende}>
          <Text>P = Présent</Text>
          <Text>R = Retard</Text>
          <Text>A = Absent</Text>
          <Text>C = Congé</Text>
          <Text>Case vide = non renseigné</Text>
          <Text>{`Cumul de ${nomMois} (du 1er au ${fmt(fiche.mois.fin, { day: "numeric" })}, à ce jour) : Prés. = présents, Ret. = retards, Abs. = absences, Cgé = congés, N.R. = jours non renseignés`}</Text>
        </View>

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
