"use client";

import { useState, useTransition } from "react";
import { BellRing } from "lucide-react";
import { definirAlertesStockEmail } from "@/lib/actions/reapprovisionnement";
import { useT } from "@/lib/i18n/contexte";

/** Une case : recevoir (ou non) chaque matin un email récapitulatif des produits passés en stock bas ou en rupture. Contrôle refait côté serveur. */
export function ReglageAlertes({ actif }: { actif: boolean }) {
  const t = useT();
  const [valeur, setValeur] = useState(actif);
  const [retour, setRetour] = useState<string | null>(null);
  const [enCours, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-1 rounded-lg border p-3 text-sm">
      <label className="flex items-start gap-2">
        <input
          type="checkbox"
          className="mt-1 size-4 accent-primary"
          checked={valeur}
          disabled={enCours}
          onChange={(e) => {
            const suivant = e.target.checked;
            setRetour(null);
            startTransition(async () => {
              const r = await definirAlertesStockEmail(suivant);
              if (r?.erreur) setRetour(r.erreur);
              else {
                setValeur(suivant);
                setRetour(r?.message ?? null);
              }
            });
          }}
        />
        <span className="flex items-center gap-1.5">
          <BellRing className="size-4 text-muted-foreground" aria-hidden />
          <strong>{t("Recevoir un email quand un produit passe en stock bas ou en rupture")}</strong>
        </span>
      </label>
      <p className="pl-6 text-muted-foreground">{t("Un récapitulatif chaque matin, aux administrateurs, sans répétition tant que la situation ne change pas.")}</p>
      {retour ? <p role="status" className="pl-6 text-xs text-muted-foreground">{retour}</p> : null}
    </div>
  );
}
