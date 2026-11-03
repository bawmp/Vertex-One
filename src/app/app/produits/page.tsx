import { redirect } from "next/navigation";
import Link from "next/link";
import { desc } from "drizzle-orm";
import { Package, Lock, Pencil, ClipboardCheck, TriangleAlert, Coins, Warehouse, PackageSearch, CalendarX2, Layers, ScanBarcode, Package2, Tags } from "lucide-react";
import { EtatVide } from "@/components/etat-vide";
import { avecEntreprise } from "@/db/client";
import { entreprise, produit } from "@/db/schema";
import { eq } from "drizzle-orm";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { formaterFCFA } from "@/lib/facturation/calcul";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { aReapprovisionner, niveauStock } from "@/lib/produits/niveau-stock";
import { FormulaireNouveauProduit } from "./formulaire-nouveau-produit";
import { BoutonSupprimerProduit } from "./bouton-supprimer-produit";
import { getT } from "@/lib/i18n/langue";

export default async function PageProduits({ searchParams }: { searchParams: Promise<{ filtre?: string }> }) {
  const { filtre } = await searchParams;
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

  const { tousLesProduits, gereStock } = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => ({
    tousLesProduits: await tx.select().from(produit).orderBy(desc(produit.creeLe)),
    gereStock: (await tx.select({ g: entreprise.gereStock }).from(entreprise).where(eq(entreprise.id, utilisateurConnecte.entrepriseId)))[0]?.g === true,
  }));
  const nbAReapprovisionner = gereStock ? tousLesProduits.filter(aReapprovisionner).length : 0;
  const filtreActif = gereStock && filtre === "a-reapprovisionner";
  const produits = filtreActif ? tousLesProduits.filter(aReapprovisionner) : tousLesProduits;

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Package className="size-5" aria-hidden />
          <h1 className="text-2xl font-semibold tracking-tight">{t("Produits")}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {gereStock ? (
          <Button variant="outline" size="sm" render={<Link href="/app/produits/depots" />} nativeButton={false}>
            <Warehouse data-icon="inline-start" aria-hidden />
            {t("Dépôts")}
          </Button>
          ) : null}
          {gereStock && tousLesProduits.some((p) => p.suiviStock) ? (
            <Button variant="outline" size="sm" render={<Link href="/app/produits/reapprovisionnement" />} nativeButton={false}>
              <PackageSearch data-icon="inline-start" aria-hidden />
              {t("À réapprovisionner")}
            </Button>
          ) : null}
          {gereStock ? (
            <Button variant="outline" size="sm" render={<Link href="/app/produits/kits/nouveau" />} nativeButton={false}>
              <Package2 data-icon="inline-start" aria-hidden />
              {t("Créer un kit")}
            </Button>
          ) : null}
          <Button variant="outline" size="sm" render={<Link href="/app/produits/listes-prix" />} nativeButton={false}>
            <Tags data-icon="inline-start" aria-hidden />
            {t("Listes de prix")}
          </Button>
          {gereStock ? (
            <Button variant="outline" size="sm" render={<Link href="/app/produits/scanner" />} nativeButton={false}>
              <ScanBarcode data-icon="inline-start" aria-hidden />
              {t("Scanner")}
            </Button>
          ) : null}
          {gereStock ? (
            <Button variant="outline" size="sm" render={<Link href="/app/produits/familles" />} nativeButton={false}>
              <Layers data-icon="inline-start" aria-hidden />
              {t("Variantes")}
            </Button>
          ) : null}
          {gereStock && tousLesProduits.some((p) => p.suiviStock) ? (
            <Button variant="outline" size="sm" render={<Link href="/app/produits/peremptions" />} nativeButton={false}>
              <CalendarX2 data-icon="inline-start" aria-hidden />
              {t("Péremptions")}
            </Button>
          ) : null}
          {gereStock && tousLesProduits.some((p) => p.suiviStock) ? (
            <Button variant="outline" size="sm" render={<Link href="/app/produits/valorisation" />} nativeButton={false}>
              <Coins data-icon="inline-start" aria-hidden />
              {t("Valeur du stock")}
            </Button>
          ) : null}
          {gereStock && peut(utilisateurConnecte, "PRODUITS", "MODIFIER") && produits.some((p) => p.suiviStock) ? (
            <Button variant="outline" size="sm" render={<Link href="/app/produits/inventaire" />} nativeButton={false}>
              <ClipboardCheck data-icon="inline-start" aria-hidden />
              {t("Faire l'inventaire")}
            </Button>
          ) : null}
          {peut(utilisateurConnecte, "PRODUITS", "CREER") ? <FormulaireNouveauProduit gereStock={gereStock} /> : null}
        </div>
      </div>

      {nbAReapprovisionner > 0 || filtreActif ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-600/20 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
          <span className="flex items-center gap-2">
            <TriangleAlert className="size-4 shrink-0" aria-hidden />
            {nbAReapprovisionner > 0
              ? nbAReapprovisionner === 1
                ? t("1 produit est à réapprovisionner (stock bas ou épuisé).")
                : t("{n} produits sont à réapprovisionner (stock bas ou épuisé).", { n: nbAReapprovisionner })
              : t("Aucun produit à réapprovisionner.")}
          </span>
          <Link href={filtreActif ? "/app/produits" : "/app/produits?filtre=a-reapprovisionner"} className="font-medium underline underline-offset-4">
            {filtreActif ? t("Voir tous les produits") : t("Voir ces produits")}
          </Link>
        </div>
      ) : null}

      <Card className="p-0">
        <div className="flex flex-col divide-y divide-border">
          {produits.map((p, index) => (
            <div
              key={p.id}
              style={{ animationDelay: `${Math.min(index, 8) * 30}ms` }}
              className="group/ligne relative flex animate-in fade-in flex-col gap-2 overflow-hidden px-4 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-3 text-sm fill-mode-both duration-300 transition-colors hover:bg-muted/50"
            >
              <span aria-hidden className="absolute inset-y-0 left-0 w-0.5 scale-y-0 bg-primary transition-transform duration-150 group-hover/ligne:scale-y-100" />
              <Link href={`/app/produits/${p.id}`} className="flex min-w-0 items-start gap-3 transition-transform duration-150 group-hover/ligne:translate-x-1">
                {p.imageCleStockage ? (
                  // eslint-disable-next-line @next/next/no-img-element -- l'URL passe par une route de redirection signée.
                  <img src={`/app/produits/${p.id}/image`} alt="" className="size-9 shrink-0 rounded-md border object-cover" />
                ) : (
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-md border bg-muted/40">
                    <Package className="size-4 text-muted-foreground" aria-hidden />
                  </div>
                )}
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <p className="min-w-0 break-words font-medium">{p.nom}</p>
                    {p.estKit ? <Badge variant="neutral">{t("Kit")}</Badge> : null}
                    <Badge variant="neutral">{p.type === "BIEN" ? t("Bien") : t("Service")}</Badge>
                    {gereStock && p.suiviStock ? <Badge variant={niveauStock(p) === "RUPTURE" ? "danger" : niveauStock(p) === "BAS" ? "warning" : "info"}>{niveauStock(p) === "RUPTURE" ? t("Épuisé") : niveauStock(p) === "BAS" ? t("Stock bas : {n}", { n: p.stockActuel }) : t("Stock : {n}", { n: p.stockActuel })}</Badge> : null}
                  </div>
                  {/* Description potentiellement longue (ex. décomposition d'un
                      montant en plusieurs frais) — jamais tronquée à une seule
                      ligne (échange du 2026-09-08), whitespace-pre-line
                      respecte les retours à la ligne saisis dans le Textarea. */}
                  {p.description ? <p className="whitespace-pre-line text-xs text-muted-foreground">{p.description}</p> : null}
                </div>
              </Link>
              <div className="flex shrink-0 items-center justify-between gap-3 pl-12 sm:justify-end sm:pl-0">
                <div className="text-left text-xs text-muted-foreground sm:text-right">
                  <p>{t("Vente : {prix}", { prix: formaterFCFA(p.prixVente) })}</p>
                  <p>{t("Achat : {prix}", { prix: formaterFCFA(p.prixAchat) })}</p>
                </div>
                {peut(utilisateurConnecte, "PRODUITS", "MODIFIER") ? (
                  <Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-primary" aria-label={t("Modifier {nom}", { nom: p.nom })} render={<Link href={`/app/produits/${p.id}?modifier=1`} />} nativeButton={false}>
                    <Pencil className="size-4" aria-hidden />
                  </Button>
                ) : null}
                {peut(utilisateurConnecte, "PRODUITS", "SUPPRIMER") ? <BoutonSupprimerProduit produitId={p.id} /> : null}
              </div>
            </div>
          ))}
          {produits.length === 0 && !filtreActif ? <EtatVide icone={Package} titre={t("Aucun produit pour le moment.")} description={t("Ajoutez vos produits et services pour les reprendre dans vos devis.")} /> : null}
        </div>
      </Card>
    </div>
  );
}
