"use client";

import { useState, useTransition } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { accepterDevis } from "@/lib/actions/devis";
import { useT } from "@/lib/i18n/contexte";

/** « Marquer accepté » : crée la facture et sort le stock. Si l'entreprise interdit la vente en rupture et que le stock manque, le message s'affiche ici. */
export function BoutonAccepterDevis({ devisId }: { devisId: string }) {
  const t = useT();
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-1.5">
      <Button
        type="button"
        disabled={enCours}
        onClick={() => {
          setErreur(null);
          startTransition(async () => {
            const resultat = await accepterDevis(devisId);
            if (resultat?.erreur) setErreur(resultat.erreur);
          });
        }}
      >
        {enCours ? <Spinner /> : null}
        {t("Marquer accepté")}
        <ArrowRight data-icon="inline-end" aria-hidden />
      </Button>
      {erreur ? <p role="alert" className="max-w-md text-sm text-destructive">{erreur}</p> : null}
    </div>
  );
}
