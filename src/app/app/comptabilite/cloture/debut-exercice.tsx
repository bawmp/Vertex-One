"use client";

import { useState, useTransition } from "react";
import { CircleCheck } from "lucide-react";
import { useT } from "@/lib/i18n/contexte";
import { changerDebutExercice, type EtatCloture } from "@/lib/actions/cloture";

/** Premier mois de l'exercice : janvier pour l'année civile, un autre mois pour un exercice décalé (ex. juillet à juin). Verrouillé dès qu'un exercice est clôturé. */
export function DebutExercice({ moisDebut, modifiable }: { moisDebut: number; modifiable: boolean }) {
  const t = useT();
  const [etat, setEtat] = useState<EtatCloture>(null);
  const [enCours, startTransition] = useTransition();
  const mois = Array.from({ length: 12 }, (_, i) => ({ n: i + 1, nom: new Intl.DateTimeFormat(t.locale, { month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(2026, i, 1))) }));
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border p-3">
      <label className="flex flex-wrap items-center gap-3 text-sm">
        <span className="font-medium">{t("Mon exercice commence en")}</span>
        <select
          defaultValue={moisDebut}
          disabled={!modifiable || enCours}
          className="h-9 rounded-lg border border-input bg-background px-2 text-sm capitalize"
          onChange={(e) => {
            setEtat(null);
            startTransition(async () => setEtat(await changerDebutExercice(Number(e.target.value))));
          }}
        >
          {mois.map((m) => (
            <option key={m.n} value={m.n}>
              {m.nom}
            </option>
          ))}
        </select>
      </label>
      {!modifiable ? <p className="text-xs text-muted-foreground">{t("Un exercice est déjà clôturé : le début de l'exercice ne peut plus changer.")}</p> : <p className="text-xs text-muted-foreground">{t("Janvier = année civile. Un autre mois donne un exercice décalé de douze mois (par exemple juillet à juin).")}</p>}
      {etat?.erreur ? <p role="alert" className="text-sm text-destructive">{etat.erreur}</p> : null}
      {etat?.message ? (
        <p role="status" className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
          <CircleCheck className="size-4" aria-hidden />
          {etat.message}
        </p>
      ) : null}
    </div>
  );
}
