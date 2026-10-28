"use client";

import { useState, useTransition } from "react";
import { Bell, BellOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { basculerSourdineCanal } from "@/lib/actions/notifications-chat";
import { useT } from "@/lib/i18n/contexte";

/** Met ce canal en sourdine pour la personne : plus de notification pour ses messages, sauf si on la mentionne. */
export function SourdineCanal({ canalId, sourdineInitiale }: { canalId: string; sourdineInitiale: boolean }) {
  const t = useT();
  const [sourdine, setSourdine] = useState(sourdineInitiale);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();

  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={enCours}
        aria-pressed={sourdine}
        title={sourdine ? t("Sourdine activée : seules les mentions vous préviennent.") : t("Ne plus être notifié des messages de cette conversation (sauf mentions).")}
        onClick={() =>
          demarrer(async () => {
            setErreur(null);
            const r = await basculerSourdineCanal(canalId);
            if (r.erreur) setErreur(r.erreur);
            else setSourdine(Boolean(r.sourdine));
          })
        }
      >
        {sourdine ? <BellOff data-icon="inline-start" aria-hidden /> : <Bell data-icon="inline-start" aria-hidden />}
        {sourdine ? t("Sourdine activée") : t("Mettre en sourdine")}
      </Button>
      {erreur ? <span className="text-xs text-destructive">{erreur}</span> : null}
    </div>
  );
}
