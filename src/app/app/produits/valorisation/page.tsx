import { redirect } from "next/navigation";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { ArrowLeft, CircleCheck, Coins, Lock } from "lucide-react";
import { EtatVide } from "@/components/etat-vide";
import { avecEntreprise } from "@/db/client";
import { entreprise } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { disponible } from "@/lib/plans";
import { formaterFCFA } from "@/lib/facturation/calcul";
import { lireValorisation } from "@/lib/produits/valorisation";
import { Card } from "@/components/ui/card";
import { StockDesactive } from "@/components/stock-desactive";
import { gestionStockActive } from "@/lib/produits/gestion-stock";
import { ConstaterVariation } from "./constater-variation";
import { getT } from "@/lib/i18n/langue";

/** Date du jour à l'heure de Douala (UTC+1), au format AAAA-MM-JJ. */
function jourDouala(): string {
  return new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 10);
}

export default async function PageValorisation() {
  const t = await getT();
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");

  if (!peut(utilisateurConnecte, "PRODUITS", "VOIR")) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Lock className="size-8 text-muted-foreground" aria-hidden />
        <p className="text-muted-foreground">{t("Vous n'avez pas accès au catalogue Produits.")}</p>
      </div>
    );
  }

  if (!(await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) => gestionStockActive(tx, utilisateurConnecte.entrepriseId)))) return <StockDesactive peutActiver={peut(utilisateurConnecte, "PARAMETRES", "MODIFIER")} />;

  const comptaVisible = peut(utilisateurConnecte, "COMPTABILITE", "CREER");
  const donnees = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [monEntreprise] = await tx.select({ planAbonnement: entreprise.planAbonnement, statutAbonnement: entreprise.statutAbonnement }).from(entreprise).where(eq(entreprise.id, utilisateurConnecte.entrepriseId));
    return { valorisation: await lireValorisation(tx, utilisateurConnecte.entrepriseId), comptaDisponible: comptaVisible && disponible(monEntreprise, "COMPTABILITE_COMPLETE") };
  });
  const { valorisation, comptaDisponible } = donnees;
  const aujourdhui = jourDouala();

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <Link href="/app/produits" className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" aria-hidden />
        {t("Retour")}
      </Link>
      <div>
        <div className="flex items-center gap-2.5">
          <Coins className="size-5" aria-hidden />
          <h1 className="text-2xl font-semibold tracking-tight">{t("Valeur du stock")}</h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{t("Chaque produit vaut son stock multiplié par son coût moyen d'achat, mis à jour à chaque achat facturé.")}</p>
      </div>

      {valorisation.lignes.length === 0 ? (
        <EtatVide icone={Coins} titre={t("Aucun produit suivi en stock.")} description={t("Activez le suivi du stock sur vos produits depuis l'onglet Stock de leur fiche.")} />
      ) : (
        <>
          <Card>
            <div className="flex items-baseline justify-between gap-3 px-4 py-4">
              <span className="text-sm text-muted-foreground">{t("Valeur totale du stock")}</span>
              <span className="text-3xl font-semibold tabular-nums">{formaterFCFA(valorisation.total)}</span>
            </div>
          </Card>

          <Card className="p-0">
            <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-4 border-b px-4 py-2 text-xs font-medium text-muted-foreground">
              <span>{t("Produit")}</span>
              <span className="text-right">{t("En stock")}</span>
              <span className="text-right">{t("Coût moyen")}</span>
              <span className="text-right">{t("Valeur")}</span>
            </div>
            <div className="flex flex-col divide-y divide-border">
              {valorisation.lignes.map((l) => (
                <div key={l.id} className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-4 px-4 py-2 text-sm">
                  <Link href={`/app/produits/${l.id}`} className="truncate font-medium hover:underline">
                    {l.nom}
                  </Link>
                  <span className="text-right tabular-nums">{l.stockActuel}</span>
                  <span className="text-right tabular-nums text-muted-foreground">{formaterFCFA(l.coutMoyen)}</span>
                  <span className="text-right tabular-nums">{formaterFCFA(l.valeur)}</span>
                </div>
              ))}
            </div>
          </Card>

          {comptaDisponible ? (
            <Card>
              <div className="flex flex-col gap-3 p-4">
                <h2 className="text-sm font-medium">{t("Dans la comptabilité")}</h2>
                <dl className="flex flex-col gap-1 text-sm">
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">{t("Stock déjà constaté (compte 311000)")}</dt>
                    <dd className="tabular-nums">{formaterFCFA(valorisation.soldeComptable)}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">{t("Valeur réelle du stock")}</dt>
                    <dd className="tabular-nums">{formaterFCFA(valorisation.total)}</dd>
                  </div>
                </dl>
                {valorisation.ecart === 0 ? (
                  <p className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
                    <CircleCheck className="size-4" aria-hidden />
                    {t("Votre comptabilité est à jour : le stock constaté correspond à sa valeur.")}
                  </p>
                ) : (
                  <>
                    <p className="text-sm text-muted-foreground">
                      {valorisation.ecart > 0
                        ? t("Le stock a pris de la valeur depuis la dernière écriture. Constatez-le pour que votre bilan et votre résultat soient justes.")
                        : t("Le stock a perdu de la valeur depuis la dernière écriture. Constatez-le pour que votre bilan et votre résultat soient justes.")}
                    </p>
                    <ConstaterVariation dateParDefaut={aujourdhui} montantAttendu={formaterFCFA(Math.abs(valorisation.ecart))} />
                  </>
                )}
              </div>
            </Card>
          ) : null}
        </>
      )}
    </div>
  );
}
