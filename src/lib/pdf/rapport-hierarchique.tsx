import { Document, Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer";

// Couleurs en hexadécimal direct : react-pdf ne comprend pas les variables CSS. L'accent est la couleur de marque de l'entreprise.
const ACCENT_PAR_DEFAUT = "#233c7e";
const STONE_700 = "#44403c";
const STONE_500 = "#78716c";
const STONE_200 = "#e7e5e4";

const styles = StyleSheet.create({
  page: { paddingTop: 40, paddingHorizontal: 44, paddingBottom: 108, fontSize: 10.5, fontFamily: "Helvetica", color: "#1c1917", lineHeight: 1.45 },
  // Logo de l'entreprise en filigrane, centré et répété sur chaque page ; très pâle pour ne jamais gêner la lecture.
  filigrane: { position: "absolute", top: 196, left: 67, width: 460, height: 460, objectFit: "contain", opacity: 0.1 },
  entete: { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingBottom: 12 },
  logo: { width: 140, height: 52, objectFit: "contain" },
  nomEntreprise: { fontSize: 16, fontWeight: 700, lineHeight: 1.2, marginBottom: 4 },
  mentionGroupe: { fontSize: 8.5, marginTop: 1, marginBottom: 2 },
  ligneEntete: { fontSize: 9, color: STONE_700, marginBottom: 1 },
  filet: { height: 2.5, marginBottom: 22 },
  type: { fontSize: 9, letterSpacing: 1.2, textTransform: "uppercase", fontWeight: 700 },
  objet: { fontSize: 19, fontWeight: 700, marginTop: 4, marginBottom: 14 },
  meta: { flexDirection: "row", gap: 24, paddingVertical: 10, marginBottom: 20, borderTop: `1px solid ${STONE_200}`, borderBottom: `1px solid ${STONE_200}` },
  metaCol: { flex: 1 },
  metaLibelle: { fontSize: 7.5, textTransform: "uppercase", color: STONE_500, letterSpacing: 0.6, marginBottom: 3 },
  metaValeur: { fontSize: 10.5, fontWeight: 700 },
  rubrique: { marginBottom: 14 },
  rubriqueTitre: { fontSize: 8.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 4 },
  rubriqueTexte: { fontSize: 10.5 },
  signature: { marginTop: 26, alignSelf: "flex-end", width: 200 },
  signatureTrait: { borderBottom: `1px solid ${STONE_500}`, height: 34 },
  signatureNom: { fontSize: 9, color: STONE_700, marginTop: 4, textAlign: "center" },
  piedDeFilet: { position: "absolute", bottom: 86, left: 44, right: 44, height: 2 },
  piedDePage: { position: "absolute", bottom: 20, left: 44, right: 44 },
  piedDePageEntreprise: { fontSize: 9, fontWeight: 700, color: STONE_700 },
  piedDePageDetails: { fontSize: 7.5, color: STONE_500, marginTop: 2 },
  piedDePageMention: { fontSize: 7, color: STONE_500, marginTop: 6 },
});

export type RapportPDFProps = {
  entreprise: {
    nom: string;
    logoUrl: string | null;
    couleurMarque: string | null;
    adresse: string | null;
    ville: string | null;
    niu: string | null;
    rccm: string | null;
    filigraneDocuments?: boolean;
  };
  rapport: {
    objet: string;
    /** Libellé français du modèle (les PDF restent en français, quelle que soit la langue de l'interface). */
    modeleLibelle: string;
    auteurNom: string;
    destinataireNom: string;
    creeLe: Date;
    /** Rubriques remplies ; vide pour un rapport d'avant les modèles (on imprime alors `contenu`). */
    rubriques: { libelle: string | null; texte: string; ligne: boolean }[];
    contenu: string;
  };
};

/**
 * Rapport écrit sur le papier à en-tête de l'entreprise : logo, nom et coordonnées en tête, filet aux couleurs de la marque, titre,
 * expéditeur, destinataire et date, rubriques, signature de l'auteur, pied de page numéroté. Confidentiel : il n'est généré que pour
 * son auteur et son destinataire (voir la route).
 */
export function RapportHierarchiquePDF({ entreprise, rapport }: RapportPDFProps) {
  const accent = entreprise.couleurMarque ?? ACCENT_PAR_DEFAUT;
  const coordonnees = [entreprise.adresse, entreprise.ville].filter(Boolean).join(", ");
  const mentionsLegales = [entreprise.niu ? `NIU ${entreprise.niu}` : null, entreprise.rccm ? `RCCM ${entreprise.rccm}` : null].filter(Boolean).join(" · ");
  const date = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeZone: "Africa/Douala" }).format(rapport.creeLe);
  const heure = new Intl.DateTimeFormat("fr-FR", { timeStyle: "short", timeZone: "Africa/Douala" }).format(rapport.creeLe);

  return (
    <Document title={`${rapport.modeleLibelle} — ${rapport.objet}`} author={rapport.auteurNom}>
      <Page size="A4" style={styles.page}>
        {entreprise.filigraneDocuments !== false && entreprise.logoUrl ? (
          // eslint-disable-next-line jsx-a11y/alt-text -- Image de @react-pdf/renderer, pas une balise <img> HTML : pas de prop alt
          <Image src={entreprise.logoUrl} style={styles.filigrane} fixed />
        ) : null}

        <View style={styles.entete}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- Image de @react-pdf/renderer, pas une balise <img> HTML : pas de prop alt */}
          {entreprise.logoUrl ? <Image src={entreprise.logoUrl} style={styles.logo} /> : null}
          <View>
            <Text style={[styles.nomEntreprise, { color: accent }]}>{entreprise.nom}</Text>
            {entreprise.adresse ? <Text style={styles.ligneEntete}>{entreprise.adresse}</Text> : null}
            {entreprise.ville ? <Text style={styles.ligneEntete}>{entreprise.ville}</Text> : null}
            {entreprise.niu ? <Text style={styles.ligneEntete}>NIU : {entreprise.niu}</Text> : null}
            {entreprise.rccm ? <Text style={styles.ligneEntete}>RCCM : {entreprise.rccm}</Text> : null}
          </View>
        </View>
        <View style={[styles.filet, { backgroundColor: accent }]} />

        <Text style={[styles.type, { color: accent }]}>{rapport.modeleLibelle}</Text>
        <Text style={styles.objet}>{rapport.objet}</Text>

        <View style={styles.meta}>
          <View style={styles.metaCol}>
            <Text style={styles.metaLibelle}>De</Text>
            <Text style={styles.metaValeur}>{rapport.auteurNom}</Text>
          </View>
          <View style={styles.metaCol}>
            <Text style={styles.metaLibelle}>À</Text>
            <Text style={styles.metaValeur}>{rapport.destinataireNom}</Text>
          </View>
          <View style={styles.metaCol}>
            <Text style={styles.metaLibelle}>Date</Text>
            <Text style={styles.metaValeur}>{date}</Text>
            <Text style={{ fontSize: 8.5, color: STONE_500 }}>{heure}</Text>
          </View>
        </View>

        {rapport.rubriques.length > 0 ? (
          rapport.rubriques.map((r, i) => (
            <View key={i} style={styles.rubrique} wrap={!r.ligne}>
              {r.libelle ? <Text style={[styles.rubriqueTitre, { color: accent }]}>{r.libelle}</Text> : null}
              <Text style={styles.rubriqueTexte}>{r.texte}</Text>
            </View>
          ))
        ) : (
          <Text style={styles.rubriqueTexte}>{rapport.contenu}</Text>
        )}

        <View style={styles.signature} wrap={false}>
          <View style={styles.signatureTrait} />
          <Text style={styles.signatureNom}>{rapport.auteurNom}</Text>
        </View>

        {/* Pied de page répété sur chaque page : filet, coordonnées, mention de confidentialité. Pas de « Page X / Y » : un texte généré par
            `render` fait disparaître tout le bloc dans cette mise en page (constaté en essai), les rapports tiennent le plus souvent sur une page. */}
        <View fixed style={[styles.piedDeFilet, { backgroundColor: accent }]} />
        <View fixed style={styles.piedDePage}>
          <Text style={styles.piedDePageEntreprise}>{entreprise.nom}</Text>
          <Text style={styles.piedDePageDetails}>{[coordonnees, mentionsLegales].filter(Boolean).join(" — ")}</Text>
          <Text style={styles.piedDePageMention}>Document confidentiel — généré par Vertex One</Text>
        </View>
      </Page>
    </Document>
  );
}
