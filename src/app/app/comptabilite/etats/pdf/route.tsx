import { NextResponse } from "next/server";
import { getT } from "@/lib/i18n/langue";
import { eq } from "drizzle-orm";
import { renderToBuffer } from "@react-pdf/renderer";
import { avecEntreprise } from "@/db/client";
import { entreprise, journalExportDonnees } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { disponible } from "@/lib/plans";
import { lireEtatsFinanciers } from "@/lib/comptabilite/etats-donnees";
import { EtatsFinanciersPDF } from "@/lib/pdf/etats-financiers";

/**
 * GET /app/comptabilite/etats/pdf?annee=2026 — le bilan et le compte de résultat de l'exercice en PDF. Même garde que la comptabilité :
 * session, droit COMPTABILITE/VOIR (Administrateur seul), forfait comptabilité complète. Chaque téléchargement est consigné au journal
 * des exports (qui, quoi — jamais le contenu).
 */
export async function GET(requete: Request) {
  const t = await getT();
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) return new NextResponse(t("Non authentifié"), { status: 401 });
  if (!peut(utilisateurConnecte, "COMPTABILITE", "VOIR")) return new NextResponse(t("Réservé à l'administrateur et au comptable externe"), { status: 403 });

  const annee = Number(new URL(requete.url).searchParams.get("annee"));
  if (!Number.isInteger(annee) || annee < 2000 || annee > 2100) return new NextResponse(t("Exercice invalide"), { status: 400 });

  const etats = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [monEntreprise] = await tx.select({ planAbonnement: entreprise.planAbonnement, statutAbonnement: entreprise.statutAbonnement }).from(entreprise).where(eq(entreprise.id, utilisateurConnecte.entrepriseId));
    if (!disponible(monEntreprise, "COMPTABILITE_COMPLETE")) return "forfait" as const;
    const lus = await lireEtatsFinanciers(tx, utilisateurConnecte.entrepriseId, annee);
    if (lus) await tx.insert(journalExportDonnees).values({ entrepriseId: utilisateurConnecte.entrepriseId, utilisateurId: utilisateurConnecte.utilisateurId, type: "ETATS_FINANCIERS_PDF", nombreLignes: lus.resultat.lignes.length });
    return lus;
  });
  if (etats === "forfait") return new NextResponse(t("Votre abonnement est suspendu : renouvelez-le pour accéder à cette fonctionnalité."), { status: 403 });
  if (!etats) return new NextResponse(t("Exercice invalide"), { status: 400 });

  const pdf = await renderToBuffer(<EtatsFinanciersPDF etats={etats} genereLe={new Date()} />);
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="etats-financiers-${annee}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
