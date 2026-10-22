"use client";

import { useState, useTransition } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { annulerInvitation } from "@/lib/actions/invitation";
import { useT } from "@/lib/i18n/contexte";

/** Annule une invitation en attente ou expirée : le lien ne permet plus de créer de compte. */
export function BoutonAnnulerInvitation({ id }: { id: string }) {
  const t = useT();
  const [enCours, startTransition] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);
  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="ghost"
        size="xs"
        className="text-destructive"
        disabled={enCours}
        onClick={() =>
          startTransition(async () => {
            const resultat = await annulerInvitation(id);
            if (resultat?.erreur) setErreur(resultat.erreur);
          })
        }
      >
        {enCours ? <Spinner /> : <X data-icon="inline-start" aria-hidden />}
        {t("Annuler l'invitation")}
      </Button>
      {erreur ? <p className="text-xs text-destructive">{erreur}</p> : null}
    </div>
  );
}
