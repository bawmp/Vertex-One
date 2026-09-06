import Link from "next/link";
import { and, eq, ne, lt, gte, notInArray, sql } from "drizzle-orm";
import { Wallet, AlertTriangle, Users, ClipboardList, FolderClock } from "lucide-react";
import { avecEntreprise } from "@/db/client";
import { paiement, facture, deal, entreprise, tache } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { disponible } from "@/lib/plans";
import { formaterFCFA } from "@/lib/facturation/calcul";
import { dossiersSansProjetActif as recupererDossiersSansProjetActif } from "@/lib/projets/indicateurs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { STATUT_DEAL } from "@/lib/libelles";
import { libelleDossier } from "@/lib/vocabulaire";

export default async function PageTableauDeBord() {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) return null;

  // Docs/palier-1-*, section 8 — trois indicateurs, vue entreprise entière
  // (le document ne filtre pas ces requêtes par portee()).
  const { caDuMois, facturesEnRetard, pipeline, projetsDisponibles, tachesEnRetard, dossiersSansProjetActif, secteurProfil } =
    await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
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
        .select({ id: facture.id, numero: facture.numero, montantTTC: facture.montantTTC, dealId: facture.dealId })
        .from(facture)
        .where(
          and(
            eq(facture.entrepriseId, utilisateurConnecte.entrepriseId),
            lt(facture.dateEcheance, new Date()),
            notInArray(facture.statut, ["PAYEE", "ANNULEE"])
          )
        );

      const pipelineLignes = await tx
        .select({ statut: deal.statut, total: sql<string>`count(*)` })
        .from(deal)
        .where(eq(deal.entrepriseId, utilisateurConnecte.entrepriseId))
        .groupBy(deal.statut);

      const [monEntreprise] = await tx
        .select({ secteurProfil: entreprise.secteurProfil, planAbonnement: entreprise.planAbonnement, statutAbonnement: entreprise.statutAbonnement })
        .from(entreprise)
        .where(eq(entreprise.id, utilisateurConnecte.entrepriseId));

      const projetsOk = disponible(monEntreprise, "PROJETS") && disponible(monEntreprise, "DOSSIERS");
      if (!projetsOk) {
        return { caDuMois: Number(total), facturesEnRetard: enRetard, pipeline: pipelineLignes, projetsDisponibles: false, tachesEnRetard: [], dossiersSansProjetActif: [], secteurProfil: monEntreprise?.secteurProfil ?? "generique" };
      }

      // Palier 2, section 7 — tâches en retard, tous projets confondus.
      const tachesRetard = await tx
        .select({ id: tache.id, titre: tache.titre, echeance: tache.echeance, projetId: tache.projetId })
        .from(tache)
        .where(and(eq(tache.entrepriseId, utilisateurConnecte.entrepriseId), ne(tache.statut, "TERMINEE"), lt(tache.echeance, new Date())));

      // Dossiers actifs sans aucun projet en cours — signal utile pour un
      // Manager (client "en sommeil" à relancer commercialement) ; n'existait
      // pas avec le modèle fusionné de la première version du document.
      // Fonction partagée avec l'automatisation marketing du Palier 6 (voir
      // src/lib/projets/indicateurs.ts).
      const sansProjetActif = await recupererDossiersSansProjetActif(tx, utilisateurConnecte.entrepriseId);

      return {
        caDuMois: Number(total),
        facturesEnRetard: enRetard,
        pipeline: pipelineLignes,
        projetsDisponibles: true,
        tachesEnRetard: tachesRetard,
        dossiersSansProjetActif: sansProjetActif,
        secteurProfil: monEntreprise?.secteurProfil ?? "generique",
      };
    });

  const totalPipeline = pipeline.reduce((somme, p) => somme + Number(p.total), 0);
  const vocabDossier = libelleDossier(secteurProfil);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Tableau de bord</h1>
        <p className="mt-1 text-muted-foreground">
          Connecté en tant que <span className="font-medium text-foreground">{utilisateurConnecte.role}</span>.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="animate-in fade-in slide-in-from-bottom-2 duration-500 fill-mode-both">
          <CardHeader>
            <div className="flex items-center gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                <Wallet className="size-4.5" aria-hidden />
              </span>
              <CardDescription>Chiffre d&apos;affaires du mois</CardDescription>
            </div>
            <CardTitle className="mt-2 text-3xl font-semibold tracking-tight">{formaterFCFA(caDuMois)}</CardTitle>
          </CardHeader>
        </Card>

        <Card className="animate-in fade-in slide-in-from-bottom-2 duration-500 delay-100 fill-mode-both">
          <CardHeader>
            <div className="flex items-center gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-300">
                <AlertTriangle className="size-4.5" aria-hidden />
              </span>
              <CardDescription>Factures en retard</CardDescription>
            </div>
            <CardTitle className="mt-2 text-3xl font-semibold tracking-tight">{facturesEnRetard.length}</CardTitle>
          </CardHeader>
          {facturesEnRetard.length > 0 ? (
            <CardContent className="flex flex-col gap-1.5 text-sm">
              {facturesEnRetard.slice(0, 5).map((f) => (
                <Link
                  key={f.id}
                  href={`/app/facturation/factures/${f.id}`}
                  className="flex items-center justify-between rounded-md px-2 py-1 -mx-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <span>{f.numero}</span>
                  <span className="font-medium">{formaterFCFA(f.montantTTC)}</span>
                </Link>
              ))}
            </CardContent>
          ) : null}
        </Card>

        <Card className="animate-in fade-in slide-in-from-bottom-2 duration-500 delay-200 fill-mode-both">
          <CardHeader>
            <div className="flex items-center gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300">
                <Users className="size-4.5" aria-hidden />
              </span>
              <CardDescription>Pipeline commercial</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-2.5">
            {pipeline.map((p) => {
              const info = STATUT_DEAL[p.statut];
              const part = totalPipeline > 0 ? (Number(p.total) / totalPipeline) * 100 : 0;
              return (
                <div key={p.statut} className="flex flex-col gap-1">
                  <div className="flex items-center justify-between text-sm">
                    <Badge variant={info?.variante ?? "neutral"}>{info?.libelle ?? p.statut}</Badge>
                    <span className="font-medium text-foreground">{p.total}</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary transition-all duration-700" style={{ width: `${part}%` }} />
                  </div>
                </div>
              );
            })}
            {pipeline.length === 0 ? <p className="text-sm text-muted-foreground">Aucun deal.</p> : null}
          </CardContent>
        </Card>
      </div>

      {projetsDisponibles ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Card className="animate-in fade-in slide-in-from-bottom-2 duration-500 delay-300 fill-mode-both">
            <CardHeader>
              <div className="flex items-center gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
                  <ClipboardList className="size-4.5" aria-hidden />
                </span>
                <CardDescription>Tâches en retard</CardDescription>
              </div>
              <CardTitle className="mt-2 text-3xl font-semibold tracking-tight">{tachesEnRetard.length}</CardTitle>
            </CardHeader>
            {tachesEnRetard.length > 0 ? (
              <CardContent className="flex flex-col gap-1.5 text-sm">
                {tachesEnRetard.slice(0, 5).map((t) => (
                  <Link
                    key={t.id}
                    href={`/app/projets/${t.projetId}`}
                    className="flex items-center justify-between rounded-md px-2 py-1 -mx-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <span className="truncate">{t.titre}</span>
                  </Link>
                ))}
              </CardContent>
            ) : null}
          </Card>

          <Card className="animate-in fade-in slide-in-from-bottom-2 duration-500 delay-300 fill-mode-both">
            <CardHeader>
              <div className="flex items-center gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-stone-100 text-stone-600 dark:bg-stone-500/10 dark:text-stone-300">
                  <FolderClock className="size-4.5" aria-hidden />
                </span>
                <CardDescription>{vocabDossier.pluriel} sans travail en cours</CardDescription>
              </div>
              <CardTitle className="mt-2 text-3xl font-semibold tracking-tight">{dossiersSansProjetActif.length}</CardTitle>
            </CardHeader>
            {dossiersSansProjetActif.length > 0 ? (
              <CardContent className="flex flex-col gap-1.5 text-sm">
                {dossiersSansProjetActif.slice(0, 5).map((d) => (
                  <Link
                    key={d.id}
                    href={`/app/projets/dossiers/${d.id}`}
                    className="flex items-center justify-between rounded-md px-2 py-1 -mx-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <span className="truncate">{d.titre}</span>
                  </Link>
                ))}
              </CardContent>
            ) : null}
          </Card>
        </div>
      ) : null}
    </div>
  );
}
