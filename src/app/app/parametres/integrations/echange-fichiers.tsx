import Link from "next/link";
import { Download, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/contexte";

/**
 * Échange de fichiers : marche avec n'importe quel site (Shopify, Wix, PrestaShop…) ou même un simple tableur, sans rien installer ni
 * brancher. Deux gestes : télécharger le stock de Vertex One pour le charger sur le site, et importer les commandes exportées du site
 * pour faire baisser le stock (avec l'aperçu « simulation » de l'assistant d'import, et sans jamais compter une commande deux fois).
 */
export function EchangeFichiers() {
  const t = useT();
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        {t("Rien à installer ni à brancher : vous échangez deux fichiers avec votre site, quand vous le souhaitez (par exemple chaque matin). Cela marche avec Shopify, Wix, PrestaShop, WooCommerce ou n'importe quel autre site.")}
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-2 rounded-lg border p-4">
          <p className="flex items-center gap-2 text-sm font-medium"><Download className="size-4 text-primary" aria-hidden />{t("1. Mettre le stock sur votre site")}</p>
          <p className="text-xs text-muted-foreground">
            {t("Téléchargez un fichier à deux colonnes (SKU, Stock) avec le stock disponible de chaque produit relié. Chargez-le avec l'outil d'import de produits ou de stock de votre site : la plupart acceptent un fichier avec un code et une quantité (voir l'aide de votre plateforme).")}
          </p>
          <Button size="sm" className="mt-auto w-fit" render={<a href="/app/produits/export-stock-site" download />} nativeButton={false}>
            <Download data-icon="inline-start" aria-hidden />
            {t("Télécharger mon stock")}
          </Button>
        </div>

        <div className="flex flex-col gap-2 rounded-lg border p-4">
          <p className="flex items-center gap-2 text-sm font-medium"><Upload className="size-4 text-primary" aria-hidden />{t("2. Faire baisser le stock avec vos commandes")}</p>
          <p className="text-xs text-muted-foreground">
            {t("Exportez les commandes de votre site (CSV ou Excel : numéro de commande, code de l'article, quantité) et importez-les ici. Vous voyez d'abord ce qui va se passer. Une commande déjà importée est ignorée : vous pouvez réimporter le même fichier sans risque.")}
          </p>
          <Link href="/app/parametres/import?type=COMMANDES_SITE" className="mt-auto inline-flex w-fit items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
            <Upload className="size-4" aria-hidden />
            {t("Importer les commandes")}
          </Link>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">{t("Le lien entre votre site et Vertex One est le code de l'article : le champ « Code-barres » de la fiche produit doit être identique au SKU de votre site.")}</p>
    </div>
  );
}
