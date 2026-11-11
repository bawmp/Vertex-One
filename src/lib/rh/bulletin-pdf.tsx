import "server-only";
import { renderToBuffer } from "@react-pdf/renderer";
import type { lireBulletin } from "@/lib/rh/paie";
import { libelleModePaiement, libelleMois, libelleTypePrime, referenceBulletin } from "@/lib/rh/paie-regles";
import { BulletinPaiePDF } from "@/lib/pdf/bulletin-paie";
import { logoPourPDF } from "@/lib/pdf/logo";

type LigneBulletin = NonNullable<Awaited<ReturnType<typeof lireBulletin>>>;

/** Rend le PDF d'un bulletin déjà lu en base (route de téléchargement ET email envoyé à la personne payée). */
export async function rendreBulletinPDF(ligne: LigneBulletin): Promise<Buffer> {
  const p = ligne.paiement;
  const logoUrl = await logoPourPDF(ligne.logoCleStockage, ligne.logoTypeMime);
  const props = {
    entreprise: { nom: ligne.entrepriseNom, logoUrl, couleurMarque: ligne.couleurMarque, adresse: ligne.adresse, ville: ligne.ville, niu: ligne.niu, rccm: ligne.rccm, filigraneDocuments: ligne.filigraneDocuments },
    bulletin: {
      reference: referenceBulletin(p.mois, p.id),
      moisLibelle: libelleMois(p.mois, "fr-FR").replace(/^./, (c) => c.toUpperCase()),
      employeNom: ligne.nomComplet,
      poste: ligne.poste,
      dateEmbauche: ligne.dateEmbauche ? new Date(ligne.dateEmbauche).toISOString().slice(0, 10) : null,
      datePaiement: p.datePaiement,
      modePaiementLibelle: libelleModePaiement(p.modePaiement),
      salaireBase: p.salaireBase,
      primes: p.primes.map((x) => ({ libelle: libelleTypePrime(x.type), montant: x.montant, motif: x.motif })),
      totalPrimes: p.totalPrimes,
      retenues: p.retenues,
      totalRetenues: p.totalRetenues,
      net: p.net,
    },
  };
  try {
    return await renderToBuffer(<BulletinPaiePDF {...props} />);
  } catch (erreur) {
    // Un logo que react-pdf ne sait pas lire ne doit jamais empêcher le bulletin de sortir : on réessaie sans lui.
    console.error("[pdf] bulletin de paie : rendu en échec, nouvel essai sans logo :", erreur instanceof Error ? erreur.message : erreur);
    if (!logoUrl) throw erreur;
    return await renderToBuffer(<BulletinPaiePDF {...props} entreprise={{ ...props.entreprise, logoUrl: null }} />);
  }
}
