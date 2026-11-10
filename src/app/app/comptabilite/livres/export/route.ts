import { createElement } from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { NextResponse } from "next/server";
import { LivreComptablePDF } from "@/lib/pdf/livre-comptable";
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
import { contenuExport, formatLogicielValide } from "@/lib/comptabilite/export-logiciels";
import { lireLignes } from "@/lib/comptabilite/livres";
import { gte, lte, and } from "drizzle-orm";
import { ecritureComptable } from "@/db/schema";
import { lireBalanceAgee, lireGrandLivreAuxiliaire } from "@/lib/comptabilite/tiers";
import { csvBalanceAgee, csvGrandLivreAuxiliaire } from "@/lib/comptabilite/tiers-export";
import { getT } from "@/lib/i18n/langue";

/**
 * GET /app/comptabilite/livres/export?vue=grand-livre|balance|journaux|tva&du=AAAA-MM-JJ&au=AAAA-MM-JJ&compte=411000 — télécharge le
 * livre demandé en CSV (Excel français). Même garde que la page : session, droit COMPTABILITE/VOIR (Administrateur seul) et forfait
 * comptabilité complète, toujours revérifiés ici ; les écritures sont lues sous la protection par entreprise de la session.
 */
export async function GET(requete: Request) {
  const t = await getT();
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) return new NextResponse(t("Non authentifié"), { status: 401 });
  if (!peut(utilisateurConnecte, "COMPTABILITE", "VOIR")) return new NextResponse(t("Réservé à l'administrateur"), { status: 403 });

  const url = new URL(requete.url);
  const vue = url.searchParams.get("vue");
  if (vue === "ecritures") return await exporterEcritures(utilisateurConnecte, url, t);
  const VUES_TIERS = ["clients", "fournisseurs", "agee-clients", "agee-fournisseurs"];
  if (vue !== "grand-livre" && vue !== "balance" && vue !== "journaux" && vue !== "tva" && !(vue && VUES_TIERS.includes(vue))) return new NextResponse(t("Livre inconnu"), { status: 404 });
  const defaut = periodePredefinie("annee", new Date());
  const du = dateDouala(url.searchParams.get("du") ?? defaut.du, false);
  const au = dateDouala(url.searchParams.get("au") ?? defaut.au, true);
  if (!du || !au || du > au) return new NextResponse(t("Période invalide"), { status: 400 });
  const reportBrut = url.searchParams.get("report") ?? "";
  const creditReporte = /^\d{1,12}$/.test(reportBrut) ? Number(reportBrut) : 0;
  const compte = url.searchParams.get("compte");
  if (compte && !/^\d{1,10}$/.test(compte)) return new NextResponse(t("Compte invalide"), { status: 400 });

  const tableau: TableauCsv | null = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [monEntreprise] = await tx.select({ planAbonnement: entreprise.planAbonnement, statutAbonnement: entreprise.statutAbonnement }).from(entreprise).where(eq(entreprise.id, utilisateurConnecte.entrepriseId));
    if (!disponible(monEntreprise, "COMPTABILITE_COMPLETE")) return null;
    const periode = { du, au };
    if (vue === "clients" || vue === "fournisseurs") {
      const nature = vue === "clients" ? "CLIENT" : "FOURNISSEUR";
      return csvGrandLivreAuxiliaire(await lireGrandLivreAuxiliaire(tx, utilisateurConnecte.entrepriseId, nature, periode, url.searchParams.get("tiers") || undefined), nature);
    }
    if (vue === "agee-clients" || vue === "agee-fournisseurs") {
      const nature = vue === "agee-clients" ? "CLIENT" : "FOURNISSEUR";
      return csvBalanceAgee(await lireBalanceAgee(tx, utilisateurConnecte.entrepriseId, nature), nature);
    }
    if (vue === "tva") {
      const declaration = await lireDeclarationTva(tx, utilisateurConnecte.entrepriseId, periode);
      return csvTva(declaration, calculerTva(declaration.tvaCollectee, declaration.tvaDeductible, creditReporte), creditReporte);
    }
    if (vue === "grand-livre") return csvGrandLivre(await lireGrandLivre(tx, utilisateurConnecte.entrepriseId, periode, compte || undefined));
    if (vue === "balance") return csvBalance(await lireBalancePeriode(tx, utilisateurConnecte.entrepriseId, periode));
    return csvJournaux(await lireJournaux(tx, utilisateurConnecte.entrepriseId, periode));
  });
  if (!tableau) return new NextResponse(t("Votre abonnement est suspendu : renouvelez-le pour accéder à cette fonctionnalité."), { status: 403 });

  if (url.searchParams.get("format") === "pdf") {
    const societe = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => (await tx.select({ nom: entreprise.nom, niu: entreprise.niu }).from(entreprise).where(eq(entreprise.id, utilisateurConnecte.entrepriseId)))[0]);
    const TITRES: Record<string, string> = { "grand-livre": "Grand livre", balance: "Balance", journaux: "Journaux", tva: "Déclaration de TVA", clients: "Grand livre clients", fournisseurs: "Grand livre fournisseurs", "agee-clients": "Balance âgée clients", "agee-fournisseurs": "Balance âgée fournisseurs" };
    const fr = (d: string) => d.split("-").reverse().join("/");
    const periodeTexte = vue === "agee-clients" || vue === "agee-fournisseurs" ? "À la date du jour" : `Du ${fr(url.searchParams.get("du") ?? defaut.du)} au ${fr(url.searchParams.get("au") ?? defaut.au)}`;
    const pdf = await renderToBuffer(createElement(LivreComptablePDF as never, { titre: TITRES[vue as string] ?? t("Livre comptable"), entreprise: { nom: societe?.nom ?? "", niu: societe?.niu ?? null }, periode: periodeTexte, entetes: tableau.entetes, lignes: tableau.lignes, genereLe: new Date() } as never) as never);
    const nomPdf = `${vue}-${url.searchParams.get("du") ?? defaut.du}-${url.searchParams.get("au") ?? defaut.au}`.replace(/[^a-z0-9-]/gi, "");
    return new NextResponse(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="vertexone-${nomPdf}.pdf"`, "Cache-Control": "no-store" } });
  }

  const nom = `${vue}-${url.searchParams.get("du") ?? defaut.du}-${url.searchParams.get("au") ?? defaut.au}`.replace(/[^a-z0-9-]/gi, "");
  return new NextResponse(ecrireCsv(tableau.entetes, tableau.lignes), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="vertexone-${nom}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

/** GET ...?vue=ecritures&format=fec|sage|ciel&du=&au= — fichier des écritures de la période pour un autre logiciel (priorité 4.1). */
async function exporterEcritures(utilisateurConnecte: NonNullable<Awaited<ReturnType<typeof recupererUtilisateurConnecte>>>, url: URL, t: Awaited<ReturnType<typeof getT>>) {
  const format = url.searchParams.get("format");
  if (!formatLogicielValide(format)) return new NextResponse(t("Format inconnu"), { status: 404 });
  const defaut = periodePredefinie("annee", new Date());
  const du = dateDouala(url.searchParams.get("du") ?? defaut.du, false);
  const au = dateDouala(url.searchParams.get("au") ?? defaut.au, true);
  if (!du || !au || du > au) return new NextResponse(t("Période invalide"), { status: 400 });
  const lignes = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [monEntreprise] = await tx.select({ planAbonnement: entreprise.planAbonnement, statutAbonnement: entreprise.statutAbonnement }).from(entreprise).where(eq(entreprise.id, utilisateurConnecte.entrepriseId));
    if (!disponible(monEntreprise, "COMPTABILITE_COMPLETE")) return null;
    return lireLignes(tx, utilisateurConnecte.entrepriseId, [and(gte(ecritureComptable.dateEcriture, du), lte(ecritureComptable.dateEcriture, au))!]);
  });
  if (!lignes) return new NextResponse(t("Votre abonnement est suspendu : renouvelez-le pour accéder à cette fonctionnalité."), { status: 403 });
  const { corps, type, extension } = contenuExport(lignes, format);
  const nom = `ecritures-${format}-${url.searchParams.get("du") ?? defaut.du}-${url.searchParams.get("au") ?? defaut.au}`.replace(/[^a-z0-9-]/gi, "");
  return new NextResponse(new Uint8Array(corps), { headers: { "Content-Type": type, "Content-Disposition": `attachment; filename="vertexone-${nom}.${extension}"`, "Cache-Control": "no-store" } });
}
