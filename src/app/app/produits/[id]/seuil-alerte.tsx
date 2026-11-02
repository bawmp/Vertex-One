"use client";

import { useState, useTransition } from "react";
import { BellRing, CircleCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Champ } from "@/components/formulaire/champ";
import { definirSeuilAlerteProduit, type EtatStock } from "@/lib/actions/produit";
import { useT } from "@/lib/i18n/contexte";

/**
 * Alerte de stock bas : une seule case, « prévenez-moi quand il en reste … ou moins ». Vide = pas d'alerte (la rupture, elle,
 * est toujours signalée). Les contrôles sont refaits côté serveur.
 */
export function SeuilAlerte({ produitId, seuilActuel }: { produitId: string; seuilActuel: number | null }) {
  const t = useT();
  const [enCours, startTransition] = useTransition();
  const [etat, setEtat] = useState<EtatStock>(null);

  function enregistrer(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const donnees = new FormData(e.currentTarget);
    setEtat(null);
    startTransition(async () => setEtat(await definirSeuilAlerteProduit(produitId, null, donnees)));
  }

  return (
    <Card>
      <CardContent>
        <form onSubmit={enregistrer} className="flex flex-col gap-3" aria-label={t("Alerte de stock bas")}>
          <div className="flex items-start gap-3">
            <BellRing className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
            <div>
              <h2 className="text-sm font-medium">{t("Alerte de stock bas")}</h2>
              <p className="text-sm text-muted-foreground">{t("Le produit passe en « stock bas » dans votre liste quand il en reste ce nombre ou moins. Laissez vide pour ne pas être prévenu.")}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-start gap-3">
            <Champ label={t("Prévenez-moi à partir de")} name="seuil" type="number" min={0} step={1} inputMode="numeric" defaultValue={seuilActuel ?? ""} className="w-64" />
            <Button type="submit" disabled={enCours} className="mt-1">
              {enCours ? <Spinner /> : null}
              {t("Enregistrer")}
            </Button>
          </div>
          {etat?.erreur ? <p role="alert" className="text-sm text-destructive">{etat.erreur}</p> : null}
          {etat?.message ? (
            <p role="status" className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
              <CircleCheck className="size-4" aria-hidden />
              {etat.message}
            </p>
          ) : null}
        </form>
      </CardContent>
    </Card>
  );
}
