import { Document, Page, View, Text, StyleSheet, renderToBuffer } from "@react-pdf/renderer";

// Couleurs en hexadécimal direct : react-pdf ne comprend pas les variables CSS.
const BLEU = "#233c7e";
const ORANGE = "#ed7623";
const GRIS = "#78716c";
const GRIS_CLAIR = "#e7e5e4";

const styles = StyleSheet.create({
  page: { padding: 44, fontSize: 10, fontFamily: "Helvetica", color: "#1c1917" },
  bandeau: { borderBottom: `3px solid ${ORANGE}`, paddingBottom: 10, marginBottom: 22 },
  titre: { fontSize: 20, fontWeight: 700, color: BLEU },
  sousTitre: { fontSize: 10, color: GRIS, marginTop: 4 },
  section: { marginBottom: 16 },
  etiquette: { fontSize: 8, textTransform: "uppercase", color: GRIS, letterSpacing: 0.5, marginBottom: 3 },
  valeur: { fontSize: 11 },
  mono: { fontSize: 8.5, fontFamily: "Courier", marginTop: 2 },
  signataire: { border: `1px solid ${GRIS_CLAIR}`, borderRadius: 4, padding: 10, marginBottom: 10 },
  signataireNom: { fontSize: 12, fontWeight: 700, marginBottom: 6 },
  ligne: { flexDirection: "row", marginBottom: 3 },
  ligneEtiquette: { width: 120, color: GRIS },
  ligneValeur: { flex: 1 },
  statutSigne: { color: "#15803d", fontWeight: 700 },
  statutRefuse: { color: "#b91c1c", fontWeight: 700 },
  note: { marginTop: 14, fontSize: 8.5, color: GRIS, lineHeight: 1.4 },
});

export type SignataireCertificat = {
  nom: string;
  telephone: string;
  email: string | null;
  statut: string;
  signeLe: Date | null;
  adresseIP: string | null;
  navigateurUtilisateur: string | null;
  consentementExplicite: boolean;
};

export type CertificatSignatureProps = {
  entrepriseNom: string;
  titreDocument: string;
  nomFichier: string;
  empreinteDocument: string;
  referenceDemande: string;
  demandeParNom: string;
  demandeLe: Date;
  signataires: SignataireCertificat[];
  genereLe: Date;
};

/** Date et heure à Yaoundé (UTC+1) — le fuseau des parties — suivies de l'horodatage UTC, non ambigu. */
export function formaterHorodatage(date: Date): string {
  const local = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeStyle: "medium", timeZone: "Africa/Douala" }).format(date);
  return `${local} (heure de Yaoundé, UTC+1) — ${date.toISOString()} UTC`;
}

function Ligne({ etiquette, valeur }: { etiquette: string; valeur: string }) {
  return (
    <View style={styles.ligne}>
      <Text style={styles.ligneEtiquette}>{etiquette}</Text>
      <Text style={styles.ligneValeur}>{valeur}</Text>
    </View>
  );
}

export function CertificatSignaturePDF(props: CertificatSignatureProps) {
  const toutSigne = props.signataires.length > 0 && props.signataires.every((s) => s.statut === "SIGNE");
  return (
    <Document title={`Certificat de signature — ${props.titreDocument}`}>
      <Page size="A4" style={styles.page}>
        <View style={styles.bandeau}>
          <Text style={styles.titre}>Certificat de signature électronique</Text>
          <Text style={styles.sousTitre}>{props.entrepriseNom} — généré le {formaterHorodatage(props.genereLe)}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.etiquette}>Document signé</Text>
          <Text style={styles.valeur}>{props.titreDocument}</Text>
          <Text style={styles.sousTitre}>Fichier : {props.nomFichier}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.etiquette}>Empreinte numérique du document (SHA-256)</Text>
          <Text style={styles.mono}>{props.empreinteDocument}</Text>
          <Text style={styles.note}>
            Cette empreinte a été calculée au moment de l&apos;envoi. Toute modification ultérieure du fichier en changerait la valeur : elle prouve que le document signé est identique à celui qui a été envoyé.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.etiquette}>Demande de signature</Text>
          <Ligne etiquette="Référence" valeur={props.referenceDemande} />
          <Ligne etiquette="Envoyée par" valeur={props.demandeParNom} />
          <Ligne etiquette="Envoyée le" valeur={formaterHorodatage(props.demandeLe)} />
          <Ligne etiquette="Statut" valeur={toutSigne ? "Signé par tous les signataires" : "En cours"} />
        </View>

        <Text style={styles.etiquette}>Signataires</Text>
        {props.signataires.map((s, i) => (
          <View key={i} style={styles.signataire} wrap={false}>
            <Text style={styles.signataireNom}>{s.nom}</Text>
            <Ligne etiquette="Téléphone" valeur={s.telephone} />
            <Ligne etiquette="Email" valeur={s.email ?? "non renseigné"} />
            <View style={styles.ligne}>
              <Text style={styles.ligneEtiquette}>Statut</Text>
              <Text style={[styles.ligneValeur, s.statut === "SIGNE" ? styles.statutSigne : styles.statutRefuse]}>{s.statut === "SIGNE" ? "SIGNÉ" : s.statut === "REFUSE" ? "REFUSÉ" : s.statut}</Text>
            </View>
            {s.signeLe ? <Ligne etiquette="Signé le" valeur={formaterHorodatage(s.signeLe)} /> : null}
            <Ligne etiquette="Adresse IP" valeur={s.adresseIP ?? "non enregistrée"} />
            <Ligne etiquette="Appareil" valeur={s.navigateurUtilisateur ?? "non enregistré"} />
            <Ligne etiquette="Identité vérifiée" valeur="par code à usage unique envoyé à l'adresse email du signataire" />
            <Ligne etiquette="Consentement" valeur={s.consentementExplicite ? "consentement explicite recueilli avant la signature" : "non recueilli"} />
          </View>
        ))}

        <Text style={styles.note}>
          Signature électronique simple : la valeur probatoire repose sur l&apos;ensemble des éléments ci-dessus (code de vérification, consentement explicite, horodatage, adresse IP et appareil). Ce certificat accompagne le document signé et doit être conservé avec lui.
        </Text>
      </Page>
    </Document>
  );
}

export function rendreCertificatSignaturePDF(props: CertificatSignatureProps): Promise<Buffer> {
  return renderToBuffer(<CertificatSignaturePDF {...props} />);
}
