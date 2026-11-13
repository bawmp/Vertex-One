"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { AlertTriangle, ImageDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { chargerImagesMaintenant } from "@/lib/actions/produit";
import { useT } from "@/lib/i18n/contexte";

type Refus = { id: string; nom: string; motif: string };

/**
 * Images de produits importées avec une adresse web : combien attendent encore d'être chargées (bouton pour les charger tout de suite, sans
 * attendre), et les refus avec leur motif pour que l'utilisateur sache quoi corriger. Rien ne s'affiche quand il n'y a rien à dire.
 */
export function ImagesEnAttente({ enAttente, refusees, peutModifier }: { enAttente: number; refusees: Refus[]; peutModifier: boolean }) {
  const t = useT();
  const [occupe, demarrer] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  if (enAttente === 0 && refusees.length === 0) return null;

  function charger() {
    setMessage(null);
    demarrer(async () => {
      const r = await chargerImagesMaintenant();
      if (r.erreur) setMessage(r.erreur);
      else if (r.stockageIndisponible) setMessage(t("Le stockage des images n'est pas disponible pour le moment : réessayez plus tard."));
      else setMessage(t("{a} image(s) chargée(s), {b} refusée(s), {c} encore en attente.", { a: r.chargees, b: r.refusees, c: r.enAttente }));
    });
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border p-4 text-sm">
      {enAttente > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-2 font-medium">
            <ImageDown className="size-4 text-primary" aria-hidden />
            {t("{n} image(s) de produits en cours de chargement depuis leur adresse web.", { n: enAttente })}
          </p>
          {peutModifier ? (
            <Button type="button" size="sm" variant="outline" disabled={occupe} onClick={charger}>
              {occupe ? <Spinner /> : null}
              {t("Charger maintenant")}
            </Button>
          ) : null}
        </div>
      ) : null}
      {message ? <p role="status" className="text-xs text-muted-foreground">{message}</p> : null}
      {refusees.length > 0 ? (
        <details>
          <summary className="flex cursor-pointer items-center gap-2 text-amber-800 dark:text-amber-300">
            <AlertTriangle className="size-4" aria-hidden />
            {t("{n} image(s) n'ont pas pu être chargées", { n: refusees.length })}
          </summary>
          <ul className="mt-2 flex flex-col divide-y divide-border">
            {refusees.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                <Link href={`/app/produits/${r.id}`} className="text-primary underline">{r.nom}</Link>
                <span className="text-xs text-muted-foreground">{t(r.motif)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">{t("Ouvrez le produit pour envoyer son image depuis votre ordinateur.")}</p>
        </details>
      ) : null}
    </div>
  );
}
