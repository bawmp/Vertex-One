"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Hourglass, RefreshCw, Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { etendreEssai, reactiverManuellement, suspendreManuellement } from "@/lib/actions/plateforme";

/**
 * window.confirm() plutôt qu'un composant Dialog — aucun n'existe dans ce
 * projet, pas la peine d'en introduire un pour trois confirmations peu
 * fréquentes (voir plan). Chaque action rafraîchit la page pour refléter le
 * nouvel état + la nouvelle ligne d'historique.
 */
export function ActionsEntreprise({ entrepriseId, peutEtendreEssai }: { entrepriseId: string; peutEtendreEssai: boolean }) {
  const router = useRouter();
  const [enCours, startTransition] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);

  function executer(action: () => Promise<{ erreur?: string }>, confirmation: string) {
    if (!window.confirm(confirmation)) return;
    setErreur(null);
    startTransition(async () => {
      const resultat = await action();
      if (resultat.erreur) {
        setErreur(resultat.erreur);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {peutEtendreEssai ? (
          <Button
            type="button"
            variant="outline"
            disabled={enCours}
            onClick={() => executer(() => etendreEssai(entrepriseId, 7), "Prolonger l'essai de 7 jours ?")}
          >
            {enCours ? <Spinner data-icon="inline-start" /> : <Hourglass data-icon="inline-start" aria-hidden />}
            Prolonger l&apos;essai de 7 jours
          </Button>
        ) : null}
        <Button
          type="button"
          variant="outline"
          disabled={enCours}
          onClick={() => executer(() => reactiverManuellement(entrepriseId), "Réactiver manuellement cette entreprise pour 30 jours ?")}
        >
          {enCours ? <Spinner data-icon="inline-start" /> : <RefreshCw data-icon="inline-start" aria-hidden />}
          Réactiver manuellement
        </Button>
        <Button
          type="button"
          variant="destructive"
          disabled={enCours}
          onClick={() => executer(() => suspendreManuellement(entrepriseId), "Suspendre l'accès de cette entreprise immédiatement ?")}
        >
          {enCours ? <Spinner data-icon="inline-start" /> : <Ban data-icon="inline-start" aria-hidden />}
          Suspendre
        </Button>
      </div>
      {erreur ? <p className="text-xs text-destructive">{erreur}</p> : null}
    </div>
  );
}
