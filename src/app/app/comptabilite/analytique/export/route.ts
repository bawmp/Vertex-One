import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { avecEntreprise } from "@/db/client";
import { entreprise } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { disponible } from "@/lib/plans";
import { ecrireCsv } from "@/lib/export/csv";
import { dateDouala, periodePredefinie } from "@/lib/comptabilite/livres";
import { lireResultatAnalytique } from "@/lib/comptabilite/analytique";

/**
 * GET /app/comptabilite/analytique/export?du=AAAA-MM-JJ&au=AAAA-MM-JJ — le résultat par section en CSV (Excel français). Même garde que la page :
 * session, droit COMPTABILITE/VOIR (Administrateur seul) et forfait comptabilité complète, revérifiés ici ; lu sous la protection par entreprise.
 */
export async function GET(requete: Request) {
  const u = await recupererUtilisateurConnecte();
  if (!u) return new NextResponse("Non authentifié", { status: 401 });
  if (!peut(u, "COMPTABILITE", "VOIR")) return new NextResponse("Réservé à l'administrateur", { status: 403 });
  const url = new URL(requete.url);
  const defaut = periodePredefinie("annee", new Date());
  const duTexte = url.searchParams.get("du") ?? defaut.du;
  const auTexte = url.searchParams.get("au") ?? defaut.au;
  const du = dateDouala(duTexte, false);
  const au = dateDouala(auTexte, true);
  if (!du || !au || du > au) return new NextResponse("Période invalide", { status: 400 });
  const resultat = await avecEntreprise(u.entrepriseId, async (tx) => {
    const [e] = await tx.select({ planAbonnement: entreprise.planAbonnement, statutAbonnement: entreprise.statutAbonnement }).from(entreprise).where(eq(entreprise.id, u.entrepriseId));
    if (!disponible(e, "COMPTABILITE_COMPLETE")) return null;
    return lireResultatAnalytique(tx, u.entrepriseId, { du, au });
  });
  if (!resultat) return new NextResponse("La comptabilité complète est disponible à partir du forfait Business.", { status: 403 });
  const lignes = resultat.lignes.map((l) => [l.code ?? "", l.libelle ?? "Non affecté", String(l.produits), String(l.charges), String(l.resultat)]);
  lignes.push(["", "TOTAL", String(resultat.totalProduits), String(resultat.totalCharges), String(resultat.totalProduits - resultat.totalCharges)]);
  const nom = `analytique-${duTexte}-${auTexte}`.replace(/[^a-z0-9-]/gi, "");
  return new NextResponse(ecrireCsv(["Code", "Section", "Produits", "Charges", "Résultat"], lignes), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="vertexone-${nom}.csv"`, "Cache-Control": "no-store" },
  });
}
