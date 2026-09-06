import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { avecEntreprise } from "@/db/client";
import { entreprise, dossierRH, utilisateur } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { disponible } from "@/lib/plans";
import { exporterDossierRHCsv } from "@/lib/rh/export";

/**
 * Réservé à l'Administrateur (contient le salaire) — docs/palier-5-*,
 * section 9, étape 7 : format brut exploitable par un partenaire paie,
 * aucun calcul de cotisation ici.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (utilisateurConnecte.role !== "ADMIN") return new NextResponse("Accès refusé", { status: 403 });

  const donnees = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [monEntreprise] = await tx
      .select({ planAbonnement: entreprise.planAbonnement, statutAbonnement: entreprise.statutAbonnement })
      .from(entreprise)
      .where(eq(entreprise.id, utilisateurConnecte.entrepriseId));
    if (!disponible(monEntreprise, "RH")) return null;

    const [ligne] = await tx
      .select({
        nomComplet: utilisateur.nomComplet,
        poste: dossierRH.poste,
        typeContrat: dossierRH.typeContrat,
        dateEmbauche: dossierRH.dateEmbauche,
        dateFinContrat: dossierRH.dateFinContrat,
        salaireBase: dossierRH.salaireBase,
        nombrePersonnesACharge: dossierRH.nombrePersonnesACharge,
        soldeConges: dossierRH.soldeConges,
      })
      .from(dossierRH)
      .innerJoin(utilisateur, eq(dossierRH.utilisateurId, utilisateur.id))
      .where(eq(dossierRH.id, id));

    return ligne ?? null;
  });

  if (!donnees) return new NextResponse("Introuvable", { status: 404 });

  const csv = exporterDossierRHCsv(donnees);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="dossier-rh-${id}.csv"`,
    },
  });
}
