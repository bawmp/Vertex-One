"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Timer, Square, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { arreterMinuteur, annulerMinuteur } from "@/lib/actions/minuteur";

function formaterEcoule(millisecondes: number) {
  const secondesTotales = Math.max(0, Math.floor(millisecondes / 1000));
  const heures = Math.floor(secondesTotales / 3600);
  const minutes = Math.floor((secondesTotales % 3600) / 60);
  const secondes = secondesTotales % 60;
  return [heures, minutes, secondes].map((n) => String(n).padStart(2, "0")).join(":");
}

export function MinuteurEnCours({
  demarreLe,
  libelle,
  projetId,
  afficherLienProjet = false,
}: {
  demarreLe: string;
  libelle: string;
  projetId: string;
  afficherLienProjet?: boolean;
}) {
  const debut = new Date(demarreLe).getTime();
  const [ecoule, setEcoule] = useState(() => Date.now() - debut);
  const [enCours, startTransition] = useTransition();

  useEffect(() => {
    const intervalle = setInterval(() => setEcoule(Date.now() - debut), 1000);
    return () => clearInterval(intervalle);
  }, [debut]);

  return (
    <Card className="flex flex-row items-center justify-between gap-3 border-primary/30 bg-primary/5 p-4">
      <div className="flex min-w-0 items-center gap-3">
        <Timer className="size-5 shrink-0 animate-pulse text-primary" aria-hidden />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">
            {afficherLienProjet ? (
              <Link href={`/app/projets/${projetId}`} className="hover:underline">
                {libelle}
              </Link>
            ) : (
              libelle
            )}
          </p>
          <p className="font-mono text-lg tabular-nums">{formaterEcoule(ecoule)}</p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button type="button" variant="ghost" size="icon-sm" disabled={enCours} onClick={() => startTransition(() => annulerMinuteur())} aria-label="Annuler le minuteur">
          {enCours ? <Spinner className="size-3.5" /> : <X className="size-4" aria-hidden />}
        </Button>
        <Button type="button" size="sm" disabled={enCours} onClick={() => startTransition(() => arreterMinuteur())}>
          {enCours ? <Spinner /> : <Square data-icon="inline-start" aria-hidden />}
          Arrêter
        </Button>
      </div>
    </Card>
  );
}
