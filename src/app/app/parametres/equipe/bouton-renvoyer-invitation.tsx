"use client";

import { useState, useTransition } from "react";
import { Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { renvoyerInvitationParEmail } from "@/lib/actions/invitation";
import { useT } from "@/lib/i18n/contexte";

/** Renvoie par email une invitation encore valable (même lien, aucun nouveau jeton). */
export function BoutonRenvoyerInvitation({ id }: { id: string }) {
  const t = useT();
  const [enCours, startTransition] = useTransition();
  const [retour, setRetour] = useState<{ erreur?: string; succes?: string } | null>(null);
  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="ghost"
        size="xs"
        disabled={enCours}
        onClick={() =>
          startTransition(async () => {
            setRetour(await renvoyerInvitationParEmail(id));
          })
        }
      >
        {enCours ? <Spinner /> : <Mail data-icon="inline-start" aria-hidden />}
        {t("Renvoyer par email")}
      </Button>
      {retour?.succes ? <p className="text-xs text-emerald-700 dark:text-emerald-400">{retour.succes}</p> : null}
      {retour?.erreur ? <p className="text-xs text-destructive">{retour.erreur}</p> : null}
    </div>
  );
}
