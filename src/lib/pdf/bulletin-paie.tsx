import { Document, Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer";

// Couleurs en hexadécimal direct : react-pdf ne comprend pas les variables CSS. L'accent est la couleur de marque de l'entreprise.
const ACCENT_PAR_DEFAUT = "#233c7e";
const STONE_700 = "#44403c";
const STONE_500 = "#78716c";
const STONE_200 = "#e7e5e4";
const STONE_50 = "#fafaf9";

const styles = StyleSheet.create({
  page: { paddingTop: 40, paddingHorizontal: 44, paddingBottom: 108, fontSize: 10.5, fontFamily: "Helvetica", color: "#1c1917", lineHeight: 1.45 },
  filigrane: { position: "absolute", top: 196, left: 67, width: 460, height: 460, objectFit: "contain", opacity: 0.1 },
  entete: { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingBottom: 12 },
  logo: { width: 140, height: 52, objectFit: "contain" },
  nomEntreprise: { fontSize: 16, fontWeight: 700, lineHeight: 1.2, marginBottom: 4 },
  ligneEntete: { fontSize: 9, color: STONE_700, marginBottom: 1 },
  filet: { height: 2.5, marginBottom: 22 },
  type: { fontSize: 9, letterSpacing: 1.2, textTransform: "uppercase", fontWeight: 700 },
  titre: { fontSize: 19, fontWeight: 700, marginTop: 4, marginBottom: 14 },
  meta: { flexDirection: "row", gap: 24, paddingVertical: 10, marginBottom: 20, borderTop: `1px solid ${STONE_200}`, borderBottom: `1px solid ${STONE_200}` },
  metaCol: { flex: 1 },
  metaLibelle: { fontSize: 7.5, textTransform: "uppercase", color: STONE_500, letterSpacing: 0.6, marginBottom: 3 },
  metaValeur: { fontSize: 10.5, fontWeight: 700 },
  enteteTableau: { flexDirection: "row", paddingVertical: 6, paddingHorizontal: 8, backgroundColor: STONE_50, borderBottom: `1px solid ${STONE_200}` },
  enteteTexte: { fontSize: 8, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6, color: STONE_500 },
  ligne: { flexDirection: "row", paddingVertical: 6, paddingHorizontal: 8, borderBottom: `1px solid ${STONE_200}` },
  colDesignation: { flex: 1 },
  colMontant: { width: 110, textAlign: "right" },
  sousTexte: { fontSize: 8.5, color: STONE_500 },
  total: { flexDirection: "row", paddingVertical: 7, paddingHorizontal: 8, backgroundColor: STONE_50, borderBottom: `1px solid ${STONE_200}` },
  net: { flexDirection: "row", paddingVertical: 10, paddingHorizontal: 8, marginTop: 8 },
  netTexte: { fontSize: 13, fontWeight: 700, color: "#ffffff" },
  mention: { marginTop: 18, fontSize: 8.5, color: STONE_500 },
  signature: { marginTop: 26, alignSelf: "flex-end", width: 200 },
  signatureTrait: { borderBottom: `1px solid ${STONE_500}`, height: 34 },
  signatureNom: { fontSize: 9, color: STONE_700, marginTop: 4, textAlign: "center" },
  piedDeFilet: { position: "absolute", bottom: 86, left: 44, right: 44, height: 2 },
  piedDePage: { position: "absolute", bottom: 20, left: 44, right: 44 },
  piedDePageEntreprise: { fontSize: 9, fontWeight: 700, color: STONE_700 },
  piedDePageDetails: { fontSize: 7.5, color: STONE_500, marginTop: 2 },
  piedDePageMention: { fontSize: 7, color: STONE_500, marginTop: 6 },
});

export type BulletinPDFProps = {
  entreprise: { nom: string; logoUrl: string | null; couleurMarque: string | null; adresse: string | null; ville: string | null; niu: string | null; rccm: string | null; filigraneDocuments?: boolean };
  bulletin: {
    reference: string;
    moisLibelle: string;
    employeNom: string;
    poste: string | null;
    dateEmbauche: string | null;
    datePaiement: string;
    modePaiementLibelle: string;
    salaireBase: number;
    primes: { libelle: string; montant: number; motif: string | null }[];
    totalPrimes: number;
    retenues: { libelle: string; montant: number }[];
    totalRetenues: number;
    net: number;
  };
};

const fcfa = (n: number) => `${new Intl.NumberFormat("fr-FR").format(n).replace(/[  ]/g, " ")} FCFA`;
const jourFr = (j: string) => new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${j}T00:00:00Z`));

/**
 * Bulletin de paie SIMPLIFIÉ sur le papier à en-tête de l'entreprise : salaire de base, primes, retenues saisies par l'employeur, net payé.
 * Il ne comporte aucun calcul de cotisation sociale ni d'impôt, et le dit. Confidentiel : généré seulement pour l'Administrateur et la
 * personne payée (voir la route).
 */
export function BulletinPaiePDF({ entreprise, bulletin }: BulletinPDFProps) {
  const accent = entreprise.couleurMarque ?? ACCENT_PAR_DEFAUT;
  const coordonnees = [entreprise.adresse, entreprise.ville].filter(Boolean).join(", ");
  const mentionsLegales = [entreprise.niu ? `NIU ${entreprise.niu}` : null, entreprise.rccm ? `RCCM ${entreprise.rccm}` : null].filter(Boolean).join(" · ");
  const brut = bulletin.salaireBase + bulletin.totalPrimes;

  return (
    <Document title={`Bulletin de paie — ${bulletin.employeNom} — ${bulletin.moisLibelle}`} author={entreprise.nom}>
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

        <Text style={[styles.type, { color: accent }]}>Bulletin de paie</Text>
        <Text style={styles.titre}>{bulletin.moisLibelle}</Text>

        <View style={styles.meta}>
          <View style={styles.metaCol}>
            <Text style={styles.metaLibelle}>Employé(e)</Text>
            <Text style={styles.metaValeur}>{bulletin.employeNom}</Text>
            {bulletin.poste ? <Text style={styles.sousTexte}>{bulletin.poste}</Text> : null}
          </View>
          <View style={styles.metaCol}>
            <Text style={styles.metaLibelle}>Paiement</Text>
            <Text style={styles.metaValeur}>{jourFr(bulletin.datePaiement)}</Text>
            <Text style={styles.sousTexte}>{bulletin.modePaiementLibelle}</Text>
          </View>
          <View style={styles.metaCol}>
            <Text style={styles.metaLibelle}>Référence</Text>
            <Text style={styles.metaValeur}>{bulletin.reference}</Text>
            {bulletin.dateEmbauche ? <Text style={styles.sousTexte}>Embauché(e) le {jourFr(bulletin.dateEmbauche)}</Text> : null}
          </View>
        </View>

        <View style={styles.enteteTableau}>
          <Text style={[styles.enteteTexte, styles.colDesignation]}>Désignation</Text>
          <Text style={[styles.enteteTexte, styles.colMontant]}>Montant</Text>
        </View>
        <View style={styles.ligne} wrap={false}>
          <Text style={styles.colDesignation}>Salaire de base</Text>
          <Text style={styles.colMontant}>{fcfa(bulletin.salaireBase)}</Text>
        </View>
        {bulletin.primes.map((p, i) => (
          <View key={`p${i}`} style={styles.ligne} wrap={false}>
            <View style={styles.colDesignation}>
              <Text>Prime — {p.libelle}</Text>
              {p.motif ? <Text style={styles.sousTexte}>{p.motif}</Text> : null}
            </View>
            <Text style={styles.colMontant}>+ {fcfa(p.montant)}</Text>
          </View>
        ))}
        <View style={styles.total} wrap={false}>
          <Text style={[styles.colDesignation, { fontWeight: 700 }]}>Total dû (salaire + primes)</Text>
          <Text style={[styles.colMontant, { fontWeight: 700 }]}>{fcfa(brut)}</Text>
        </View>
        {bulletin.retenues.map((r, i) => (
          <View key={`r${i}`} style={styles.ligne} wrap={false}>
            <Text style={styles.colDesignation}>Retenue — {r.libelle}</Text>
            <Text style={styles.colMontant}>- {fcfa(r.montant)}</Text>
          </View>
        ))}
        {bulletin.retenues.length === 0 ? (
          <View style={styles.ligne} wrap={false}>
            <Text style={[styles.colDesignation, { color: STONE_500 }]}>Aucune retenue</Text>
            <Text style={styles.colMontant}>{fcfa(0)}</Text>
          </View>
        ) : null}

        <View style={[styles.net, { backgroundColor: accent }]} wrap={false}>
          <Text style={[styles.netTexte, styles.colDesignation]}>Net payé</Text>
          <Text style={[styles.netTexte, styles.colMontant]}>{fcfa(bulletin.net)}</Text>
        </View>

        <Text style={styles.mention}>
          Bulletin simplifié établi par l&apos;employeur : il ne comporte aucun calcul de cotisation sociale (CNPS) ni d&apos;impôt. Les retenues indiquées sont celles saisies par l&apos;employeur.
        </Text>

        <View style={styles.signature} wrap={false}>
          <View style={styles.signatureTrait} />
          <Text style={styles.signatureNom}>{entreprise.nom}</Text>
        </View>

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
