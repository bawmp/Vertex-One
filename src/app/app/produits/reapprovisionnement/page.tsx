import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CircleCheck, Lock, PackageSearch } from "lucide-react";
import { EtatVide } from "@/components/etat-vide";
import { avecEntreprise } from "@/db/client";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { StockDesactive } from "@/components/stock-desactive";
import { gestionStockActive } from "@/lib/produits/gestion-stock";
import { lireAReapprovisionner } from "@/lib/produits/reapprovisionnement";
import { getT } from "@/lib/i18n/langue";
import { FormulaireReappro } from "./formulaire-reappro";

export default async function PageReapprovisionnement() {
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

  const donnees = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => ((await gestionStockActive(tx, utilisateurConnecte.entrepriseId)) ? lireAReapprovisionner(tx, utilisateurConnecte.entrepriseId) : null));
  if (!donnees) return <StockDesactive peutActiver={peut(utilisateurConnecte, "PARAMETRES", "MODIFIER")} />;

  const peutCommander = peut(utilisateurConnecte, "ACHATS", "CREER");

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <Link href="/app/produits" className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" aria-hidden />
        {t("Retour")}
      </Link>
      <div>
        <div className="flex items-center gap-2.5">
          <PackageSearch className="size-5" aria-hidden />
          <h1 className="text-2xl font-semibold tracking-tight">{t("À réapprovisionner")}</h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{t("Les produits en rupture ou sous leur seuil d'alerte, avec la quantité à commander pour revenir au stock visé. Un clic crée les bons de commande, un par fournisseur.")}</p>
      </div>

      {donnees.lignes.length === 0 ? (
        <EtatVide icone={CircleCheck} titre={t("Rien à commander.")} description={t("Aucun produit n'est en rupture ni sous son seuil d'alerte.")} />
      ) : (
        <FormulaireReappro lignes={donnees.lignes} fournisseurs={donnees.fournisseurs} peutCommander={peutCommander} />
      )}
      {donnees.lignes.length > 0 && !peutCommander ? <p className="text-sm text-muted-foreground">{t("Vous consultez la liste : créer un bon de commande demande le droit sur les achats.")}</p> : null}
    </div>
  );
}
