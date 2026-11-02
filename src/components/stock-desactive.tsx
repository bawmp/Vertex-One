import Link from "next/link";
import { Boxes } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { getT } from "@/lib/i18n/langue";

/** Page de stock ouverte par une entreprise de services : on explique, on renvoie vers le réglage, on ne casse rien. */
export async function StockDesactive({ peutActiver }: { peutActiver: boolean }) {
  const t = await getT();
  return (
    <div className="flex max-w-md flex-col items-center gap-3 self-center py-16 text-center">
      <Boxes className="size-8 text-muted-foreground" aria-hidden />
      <h1 className="text-lg font-semibold">{t("La gestion de stock n'est pas activée")}</h1>
      <p className="text-sm text-muted-foreground">
        {t("Cette fonction est faite pour les entreprises qui vendent des produits. Si c'est votre cas, activez-la dans Paramètres → Entreprise.")}
      </p>
      {peutActiver ? (
        <Link href="/app/parametres/entreprise" className={buttonVariants({ size: "sm" })}>
          {t("Ouvrir les paramètres de l'entreprise")}
        </Link>
      ) : (
        <p className="text-sm text-muted-foreground">{t("Demandez à votre Administrateur de l'activer.")}</p>
      )}
    </div>
  );
}
