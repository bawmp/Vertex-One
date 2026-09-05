import Link from "next/link";
import { and, eq, gte, lt, notInArray, sql } from "drizzle-orm";
import { avecEntreprise } from "@/db/client";
import { paiement, facture, prospect } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { formaterFCFA } from "@/lib/facturation/calcul";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const LIBELLE_STATUT_PROSPECT: Record<string, string> = {
  NOUVEAU: "Nouveau",
  QUALIFIE: "Qualifié",
  PROPOSITION: "Proposition",
  GAGNE: "Gagné",
  PERDU: "Perdu",
};

export default async function PageTableauDeBord() {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) return null;

  // Docs/palier-1-*, section 8 — trois indicateurs, vue entreprise entière
  // (le document ne filtre pas ces requêtes par portee()).
  const { caDuMois, facturesEnRetard, pipeline } = await avecEntreprise(
    utilisateurConnecte.entrepriseId,
    async (tx) => {
      const debutDuMois = new Date();
      debutDuMois.setDate(1);
      debutDuMois.setHours(0, 0, 0, 0);

      const [{ total }] = await tx
        .select({ total: sql<string>`coalesce(sum(${paiement.montant}), 0)` })
        .from(paiement)
        .where(and(eq(paiement.entrepriseId, utilisateurConnecte.entrepriseId), gte(paiement.datePaiement, debutDuMois)));

      // Calculée dynamiquement (échéance dépassée, pas encore payée) plutôt
      // que sur le seul statut EN_RETARD stocké, qui dépend d'une tâche
      // planifiée pas encore branchée (voir src/lib/facturation/relance.ts).
      const enRetard = await tx
        .select({ id: facture.id, numero: facture.numero, montantTTC: facture.montantTTC, prospectId: facture.prospectId })
        .from(facture)
        .where(
          and(
            eq(facture.entrepriseId, utilisateurConnecte.entrepriseId),
            lt(facture.dateEcheance, new Date()),
            notInArray(facture.statut, ["PAYEE", "ANNULEE"])
          )
        );

      const pipelineLignes = await tx
        .select({ statut: prospect.statut, total: sql<string>`count(*)` })
        .from(prospect)
        .where(eq(prospect.entrepriseId, utilisateurConnecte.entrepriseId))
        .groupBy(prospect.statut);

      return { caDuMois: Number(total), facturesEnRetard: enRetard, pipeline: pipelineLignes };
    }
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Tableau de bord</h1>
        <p className="mt-1 text-muted-foreground">
          Connecté en tant que <span className="font-medium text-foreground">{utilisateurConnecte.role}</span>.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>Chiffre d&apos;affaires du mois</CardDescription>
            <CardTitle className="text-2xl">{formaterFCFA(caDuMois)}</CardTitle>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription>Factures en retard</CardDescription>
            <CardTitle className="text-2xl">{facturesEnRetard.length}</CardTitle>
          </CardHeader>
          {facturesEnRetard.length > 0 ? (
            <CardContent className="flex flex-col gap-1 text-sm">
              {facturesEnRetard.slice(0, 5).map((f) => (
                <Link key={f.id} href={`/app/facturation/factures/${f.id}`} className="text-muted-foreground hover:text-foreground">
                  {f.numero} — {formaterFCFA(f.montantTTC)}
                </Link>
              ))}
            </CardContent>
          ) : null}
        </Card>

        <Card>
          <CardHeader>
            <CardDescription>Pipeline commercial</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-1 text-sm">
            {pipeline.map((p) => (
              <div key={p.statut} className="flex justify-between">
                <span className="text-muted-foreground">{LIBELLE_STATUT_PROSPECT[p.statut]}</span>
                <span>{p.total}</span>
              </div>
            ))}
            {pipeline.length === 0 ? <p className="text-muted-foreground">Aucun prospect.</p> : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
