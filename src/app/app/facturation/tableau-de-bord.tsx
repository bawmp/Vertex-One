import Link from "next/link";
import { Users, Truck, Wallet2, TrendingUp, PiggyBank, FolderKanban, Landmark } from "lucide-react";
import { formaterFCFA } from "@/lib/facturation/calcul";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { STATUT_PROJET } from "@/lib/libelles";
import type { TableauDeBordFaco } from "@/lib/facturation/tableau-de-bord";

export function TableauDeBord({
  donnees,
  facturesClientVisibles,
}: {
  donnees: TableauDeBordFaco;
  facturesClientVisibles: { statut: string; montantTTC: number }[];
}) {
  const impayeesClient = facturesClientVisibles.filter((f) => f.statut === "EMISE" || f.statut === "EN_RETARD" || f.statut === "PARTIELLEMENT_PAYEE");
  const enRetardClient = impayeesClient.filter((f) => f.statut === "EN_RETARD");
  const totalImpayeClient = impayeesClient.reduce((s, f) => s + f.montantTTC, 0);
  const totalEnRetardClient = enRetardClient.reduce((s, f) => s + f.montantTTC, 0);

  const maintenant = new Date();
  const impayeesFournisseur = (donnees.facturesFournisseur ?? []).filter((f) => f.statut === "EN_ATTENTE" || f.statut === "PARTIELLEMENT_PAYEE");
  const enRetardFournisseur = impayeesFournisseur.filter((f) => f.dateEcheance < maintenant);
  const totalImpayeFournisseur = impayeesFournisseur.reduce((s, f) => s + f.montantTTC, 0);
  const totalEnRetardFournisseur = enRetardFournisseur.reduce((s, f) => s + f.montantTTC, 0);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Bonjour, {donnees.monNom}</h1>
        <p className="mt-1 text-muted-foreground">{donnees.nomEntreprise}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300">
                <Users className="size-4.5" aria-hidden />
              </span>
              <div>
                <CardTitle className="text-sm font-medium">Total des comptes clients</CardTitle>
                <CardDescription>{impayeesClient.length} facture{impayeesClient.length > 1 ? "s" : ""} impayée{impayeesClient.length > 1 ? "s" : ""}</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex items-end justify-between border-t pt-3">
            <div>
              <p className="text-2xl font-semibold tracking-tight">{formaterFCFA(totalImpayeClient)}</p>
              <p className="text-xs text-muted-foreground">Actuel</p>
            </div>
            <div className="text-right">
              <p className="text-lg font-medium text-destructive">{formaterFCFA(totalEnRetardClient)}</p>
              <p className="text-xs text-muted-foreground">En retard</p>
            </div>
          </CardContent>
        </Card>

        {donnees.facturesFournisseur !== null ? (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
                  <Truck className="size-4.5" aria-hidden />
                </span>
                <div>
                  <CardTitle className="text-sm font-medium">Total des comptes fournisseurs</CardTitle>
                  <CardDescription>
                    {impayeesFournisseur.length} facture{impayeesFournisseur.length > 1 ? "s" : ""} fournisseur{impayeesFournisseur.length > 1 ? "s" : ""} impayée{impayeesFournisseur.length > 1 ? "s" : ""}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex items-end justify-between border-t pt-3">
              <div>
                <p className="text-2xl font-semibold tracking-tight">{formaterFCFA(totalImpayeFournisseur)}</p>
                <p className="text-xs text-muted-foreground">Actuel</p>
              </div>
              <div className="text-right">
                <p className="text-lg font-medium text-destructive">{formaterFCFA(totalEnRetardFournisseur)}</p>
                <p className="text-xs text-muted-foreground">En retard</p>
              </div>
            </CardContent>
          </Card>
        ) : null}
      </div>

      {donnees.financier ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Wallet2 className="size-4" aria-hidden />
                Flux de trésorerie — depuis le {new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(donnees.financier.debutAnnee)}
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-1.5 border-t pt-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Espèces en début de période</span>
                <span className="tabular-nums">{formaterFCFA(donnees.financier.especesOuverture)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Entrant (+)</span>
                <span className="tabular-nums text-emerald-600">{formaterFCFA(donnees.financier.entrant)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Sortant (-)</span>
                <span className="tabular-nums text-destructive">{formaterFCFA(donnees.financier.sortant)}</span>
              </div>
              <div className="mt-1 flex justify-between border-t pt-1.5 font-medium">
                <span>Espèces aujourd&apos;hui (=)</span>
                <span className="tabular-nums">{formaterFCFA(donnees.financier.especesCloture)}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <TrendingUp className="size-4" aria-hidden />
                Revenu et dépense — exercice en cours
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 border-t pt-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Revenu total</span>
                <span className="text-lg font-semibold tabular-nums text-emerald-600">{formaterFCFA(donnees.financier.totalProduits)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Total des dépenses</span>
                <span className="text-lg font-semibold tabular-nums text-destructive">{formaterFCFA(donnees.financier.totalCharges)}</span>
              </div>
              <p className="text-xs text-muted-foreground">* Montants hors taxes, cumul de l&apos;exercice en cours.</p>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {donnees.depensesPrincipales.length > 0 || donnees.projetsWatchlist.length > 0 || donnees.peutVoirBanque ? (
        <div className="grid gap-4 lg:grid-cols-3">
          {donnees.facturesFournisseur !== null ? (
            <div>
              <h2 className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <PiggyBank className="size-4" aria-hidden />
                Dépenses principales
              </h2>
              <Card className="p-0">
                <div className="flex flex-col divide-y divide-border">
                  {donnees.depensesPrincipales.map((d) => (
                    <div key={d.libelle} className="flex items-center justify-between px-4 py-2.5 text-sm">
                      <span className="truncate">{d.libelle}</span>
                      <span className="tabular-nums text-muted-foreground">{formaterFCFA(d.total)}</span>
                    </div>
                  ))}
                  {donnees.depensesPrincipales.length === 0 ? (
                    <p className="px-4 py-6 text-center text-sm text-muted-foreground">Aucune dépense enregistrée pour cet exercice.</p>
                  ) : null}
                </div>
              </Card>
            </div>
          ) : null}

          <div>
            <h2 className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <FolderKanban className="size-4" aria-hidden />
              Projets
            </h2>
            <Card className="p-0">
              <div className="flex flex-col divide-y divide-border">
                {donnees.projetsWatchlist.map((p) => {
                  const info = STATUT_PROJET[p.statut];
                  return (
                    <Link key={p.id} href={`/app/projets/${p.id}`} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm hover:bg-muted/50">
                      <span className="truncate">{p.titre}</span>
                      <Badge variant={info?.variante ?? "neutral"}>{info?.libelle ?? p.statut}</Badge>
                    </Link>
                  );
                })}
                {donnees.projetsWatchlist.length === 0 ? (
                  <p className="px-4 py-6 text-center text-sm text-muted-foreground">Aucun projet à suivre pour le moment.</p>
                ) : null}
              </div>
            </Card>
          </div>

          {donnees.peutVoirBanque ? (
            <div>
              <h2 className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Landmark className="size-4" aria-hidden />
                Banque
              </h2>
              <Card>
                <CardContent className="flex flex-col items-start gap-2">
                  <p className="text-sm text-muted-foreground">
                    Importez un relevé bancaire (CSV) pour rapprocher vos paiements — aucune connexion bancaire automatique n&apos;est configurée pour l&apos;instant.
                  </p>
                  <Link href="/app/comptabilite/rapprochement" className="text-sm font-medium text-primary hover:underline">
                    Importer un relevé →
                  </Link>
                </CardContent>
              </Card>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
