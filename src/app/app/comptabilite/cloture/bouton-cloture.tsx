"use client";

import { useState, useTransition } from "react";
import { CircleCheck, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cloturerExerciceAction, type EtatCloture } from "@/lib/actions/cloture";

/** Clôture en deux gestes : cocher la confirmation (la comptabilité sera verrouillée), puis cliquer. Les contrôles sont refaits côté serveur. */
export function BoutonCloture({ annee, resultat }: { annee: number; resultat: string }) {
  const [confirme, setConfirme] = useState(false);
  const [etat, setEtat] = useState<EtatCloture>(null);
  const [enCours, startTransition] = useTransition();

  function envoyer(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const donnees = new FormData(e.currentTarget);
    setEtat(null);
    startTransition(async () => setEtat(await cloturerExerciceAction(null, donnees)));
  }

  return (
    <form onSubmit={envoyer} className="flex flex-col gap-3" aria-label={`Clôturer l'exercice ${annee}`}>
      <input type="hidden" name="annee" value={annee} />
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="confirmation" value="oui" checked={confirme} onChange={(e) => setConfirme(e.target.checked)} className="mt-1 size-4 accent-primary" />
        <span>
          Je comprends que cette clôture passe l&apos;écriture de résultat ({resultat}) et <strong>verrouille la comptabilité jusqu&apos;au 31/12/{annee}</strong> : plus aucune écriture ne pourra être datée avant cette date, sauf à la déverrouiller.
        </span>
      </label>
      {etat?.erreur ? <p role="alert" className="text-sm text-destructive">{etat.erreur}</p> : null}
      {etat?.message ? (
        <p role="status" className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
          <CircleCheck className="size-4" aria-hidden />
          {etat.message}
        </p>
      ) : null}
      <Button type="submit" disabled={!confirme || enCours} className="self-start">
        {enCours ? <Spinner /> : <LockKeyhole data-icon="inline-start" aria-hidden />}
        Clôturer l&apos;exercice {annee}
      </Button>
    </form>
  );
}
