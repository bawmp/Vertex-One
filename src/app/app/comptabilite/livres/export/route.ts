import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { avecEntreprise } from "@/db/client";
import { entreprise } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { disponible } from "@/lib/plans";
import { ecrireCsv } from "@/lib/export/csv";
import { dateDouala, lireBalancePeriode, lireGrandLivre, lireJournaux, periodePredefinie } from "@/lib/comptabilite/livres";
import { calculerTva, csvTva, lireDeclarationTva } from "@/lib/comptabilite/tva";
import { csvBalance, csvGrandLivre, csvJournaux, type TableauCsv } from "@/lib/comptabilite/livres-export";

/**
 * GET /app/comptabilite/livres/export?vue=grand-livre|balance|journaux|tva&du=AAAA-MM-JJ&au=AAAA-MM-JJ&compte=411000 — télécharge le
 * livre demandé en CSV (Excel français). Même garde que la page : session, droit COMPTABILITE/VOIR (Administrateur seul) et forfait
 * comptabilité complète, toujours revérifiés ici ; les écritures sont lues sous la protection par entreprise de la session.
 */
export async function GET(requete: Request) {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) return new NextResponse("Non authentifié", { status: 401 });
  if (!peut(utilisateurConnecte, "COMPTABILITE", "VOIR")) return new NextResponse("Réservé à l'administrateur", { status: 403 });

  const url = new URL(requete.url);
  const vue = url.searchParams.get("vue");
  if (vue !== "grand-livre" && vue !== "balance" && vue !== "journaux" && vue !== "tva") return new NextResponse("Livre inconnu", { status: 404 });
  const defaut = periodePredefinie("annee", new Date());
  const du = dateDouala(url.searchParams.get("du") ?? defaut.du, false);
  const au = dateDouala(url.searchParams.get("au") ?? defaut.au, true);
  if (!du || !au || du > au) return new NextResponse("Période invalide", { status: 400 });
  const reportBrut = url.searchParams.get("report") ?? "";
  const creditReporte = /^\d{1,12}$/.test(reportBrut) ? Number(reportBrut) : 0;
  const compte = url.searchParams.get("compte");
  if (compte && !/^\d{1,10}$/.test(compte)) return new NextResponse("Compte invalide", { status: 400 });

  const tableau: TableauCsv | null = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [monEntreprise] = await tx.select({ planAbonnement: entreprise.planAbonnement, statutAbonnement: entreprise.statutAbonnement }).from(entreprise).where(eq(entreprise.id, utilisateurConnecte.entrepriseId));
    if (!disponible(monEntreprise, "COMPTABILITE_COMPLETE")) return null;
    const periode = { du, au };
    if (vue === "tva") {
      const declaration = await lireDeclarationTva(tx, utilisateurConnecte.entrepriseId, periode);
      return csvTva(declaration, calculerTva(declaration.tvaCollectee, declaration.tvaDeductible, creditReporte), creditReporte);
    }
    if (vue === "grand-livre") return csvGrandLivre(await lireGrandLivre(tx, utilisateurConnecte.entrepriseId, periode, compte || undefined));
    if (vue === "balance") return csvBalance(await lireBalancePeriode(tx, utilisateurConnecte.entrepriseId, periode));
    return csvJournaux(await lireJournaux(tx, utilisateurConnecte.entrepriseId, periode));
  });
  if (!tableau) return new NextResponse("La comptabilité complète est disponible à partir du forfait Business.", { status: 403 });

  const nom = `${vue}-${url.searchParams.get("du") ?? defaut.du}-${url.searchParams.get("au") ?? defaut.au}`.replace(/[^a-z0-9-]/gi, "");
  return new NextResponse(ecrireCsv(tableau.entetes, tableau.lignes), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="vertexone-${nom}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
