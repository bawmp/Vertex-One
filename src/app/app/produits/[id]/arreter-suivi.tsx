"use client";

import { useState, useTransition } from "react";
import { CircleCheck, PackageX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { arreterSuiviStockProduit, type EtatStock } from "@/lib/actions/produit";
import { useT } from "@/lib/i18n/contexte";

/** Arrêt du suivi du stock d'un produit, en deux temps (bouton, puis confirmation qui dit ce qui va se passer). Contrôles refaits côté serveur. */
export function ArreterSuivi({ produitId, stockActuel }: { produitId: string; stockActuel: number }) {
  const t = useT();
  const [confirme, setConfirme] = useState(false);
  const [etat, setEtat] = useState<EtatStock>(null);
  const [enCours, startTransition] = useTransition();

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <PackageX className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
          <div>
            <h2 className="text-sm font-medium">{t("Arrêter le suivi du stock")}</h2>
            <p className="text-sm text-muted-foreground">{t("Ce produit ne sera plus suivi : les ventes et les achats ne changeront plus son stock. Vous pourrez réactiver le suivi plus tard.")}</p>
          </div>
        </div>
        {etat?.erreur ? <p role="alert" className="text-sm text-destructive">{etat.erreur}</p> : null}
        {etat?.message ? (
          <p role="status" className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
            <CircleCheck className="size-4" aria-hidden />
            {etat.message}
          </p>
        ) : null}
        {!confirme ? (
          <Button type="button" variant="outline" className="self-start" onClick={() => setConfirme(true)}>
            {t("Arrêter le suivi")}
          </Button>
        ) : (
          <div className="flex flex-col gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
            <p>{stockActuel > 0 ? t("Les {n} article(s) en stock sortiront du suivi (une ligne « Fin du suivi » le garde dans l'historique). Continuer ?", { n: stockActuel }) : t("Le suivi s'arrête. Continuer ?")}</p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="destructive"
                size="sm"
                disabled={enCours}
                onClick={() => {
                  setEtat(null);
                  startTransition(async () => setEtat(await arreterSuiviStockProduit(produitId)));
                }}
              >
                {enCours ? <Spinner /> : null}
                {t("Oui, arrêter le suivi")}
              </Button>
              <Button type="button" variant="ghost" size="sm" disabled={enCours} onClick={() => setConfirme(false)}>
                {t("Non")}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
