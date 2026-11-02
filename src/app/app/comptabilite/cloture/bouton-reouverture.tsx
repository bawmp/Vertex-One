"use client";

import { useState, useTransition } from "react";
import { CircleCheck, LockOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { ChampZone } from "@/components/formulaire/champ";
import { rouvrirExerciceAction, type EtatCloture } from "@/lib/actions/cloture";

/** Réouverture du dernier exercice clôturé : un motif obligatoire, une case de confirmation, puis le bouton. Contrôles refaits côté serveur. */
export function BoutonReouverture({ annee }: { annee: number }) {
  const [ouvert, setOuvert] = useState(false);
  const [confirme, setConfirme] = useState(false);
  const [etat, setEtat] = useState<EtatCloture>(null);
  const [enCours, startTransition] = useTransition();

  if (!ouvert) {
    return (
      <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => setOuvert(true)}>
        <LockOpen data-icon="inline-start" aria-hidden />
        Rouvrir cet exercice
      </Button>
    );
  }

  return (
    <form
      className="flex flex-col gap-3 rounded-lg border border-amber-600/30 bg-amber-50 p-3 dark:bg-amber-500/10"
      aria-label={`Rouvrir l'exercice ${annee}`}
      onSubmit={(e) => {
        e.preventDefault();
        const donnees = new FormData(e.currentTarget);
        setEtat(null);
        startTransition(async () => setEtat(await rouvrirExerciceAction(null, donnees)));
      }}
    >
      <input type="hidden" name="annee" value={annee} />
      <p className="text-sm">
        Rouvrir l&apos;exercice {annee} <strong>annule l&apos;écriture de clôture</strong> (elle reste visible dans l&apos;historique) et rétablit le verrouillage d&apos;avant. Vous pourrez corriger puis clôturer de nouveau.
      </p>
      <ChampZone label="Pourquoi rouvrez-vous cet exercice ?" name="motif" required minLength={5} maxLength={300} rows={2} />
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="confirmation" value="oui" checked={confirme} onChange={(e) => setConfirme(e.target.checked)} className="mt-1 size-4 accent-primary" />
        <span>Je confirme la réouverture de l&apos;exercice {annee}.</span>
      </label>
      {etat?.erreur ? <p role="alert" className="text-sm text-destructive">{etat.erreur}</p> : null}
      {etat?.message ? (
        <p role="status" className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
          <CircleCheck className="size-4" aria-hidden />
          {etat.message}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" disabled={!confirme || enCours}>
          {enCours ? <Spinner /> : null}
          Rouvrir l&apos;exercice {annee}
        </Button>
        <Button type="button" variant="ghost" disabled={enCours} onClick={() => { setOuvert(false); setEtat(null); }}>
          Annuler
        </Button>
      </div>
    </form>
  );
}
