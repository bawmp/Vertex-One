"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

/**
 * Bloc repliable de la fiche (formulaire d'édition). L'état ouvert/fermé est LOCAL : ouvert au départ si `ouvertParDefaut` (fiche incomplète), puis
 * seul un clic le change — jamais une mise à jour de la page après un enregistrement, qui refermerait le formulaire et cacherait son message.
 */
export function BlocRepliable({ titre, ouvertParDefaut = false, children }: { titre: string; ouvertParDefaut?: boolean; children: ReactNode }) {
  const [ouvert, setOuvert] = useState(ouvertParDefaut);
  return (
    <div className="rounded-xl border bg-muted/30 data-[ouvert=true]:bg-transparent" data-ouvert={ouvert}>
      <button type="button" aria-expanded={ouvert} onClick={() => setOuvert((o) => !o)} className="flex w-full cursor-pointer items-center justify-between gap-2 px-4 py-2.5 text-left text-sm font-medium">
        {titre}
        <ChevronDown className={`size-4 shrink-0 text-muted-foreground transition-transform ${ouvert ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {ouvert ? <div className="border-t px-4 py-4">{children}</div> : null}
    </div>
  );
}
