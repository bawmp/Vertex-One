"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type EntreeSemaine = { id: string; date: string; dureeHeures: number; ligne: string };

const JOURS_COURTS = ["lun.", "mar.", "mer.", "jeu.", "ven.", "sam.", "dim."];

function arrondir(n: number) {
  return Math.round(n * 100) / 100;
}

function lundiDeLaSemaine(date: Date) {
  const d = new Date(date);
  const jour = d.getDay(); // 0 = dimanche
  const decalage = jour === 0 ? -6 : 1 - jour;
  d.setDate(d.getDate() + decalage);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Bascule "Afficher par : Jour | Semaine" (échange du 2026-09-07, comparaison
 * avec la feuille de temps Zoho Books). Le mode Jour délègue entièrement au
 * rendu existant (children, passé tel quel par la page serveur) — aucune
 * régression du rendu actuel. Le mode Semaine reste une grille en LECTURE
 * SEULE : agrégation par jour/ligne, jamais une saisie cellule par cellule
 * (chantier disproportionné par rapport à la demande, même discipline que le
 * tableau de bord FACO — pas de fonctionnalité fabriquée sans action réelle
 * derrière).
 */
export function VueFeuilleTemps({ entrees, children }: { entrees: EntreeSemaine[]; children: React.ReactNode }) {
  const [vue, setVue] = useState<"jour" | "semaine">("jour");

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">Afficher par :</span>
        <div className="flex w-fit items-center gap-0.5 rounded-lg border p-0.5">
        {([
          ["jour", "Jour"],
          ["semaine", "Semaine"],
        ] as const).map(([v, libelle]) => (
          <button
            key={v}
            type="button"
            onClick={() => setVue(v)}
            className={cn(
              "rounded-md px-3 py-1 font-medium transition-colors",
              vue === v ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {libelle}
          </button>
        ))}
        </div>
      </div>

      {vue === "jour" ? children : <GrilleSemaine entrees={entrees} />}
    </div>
  );
}

function GrilleSemaine({ entrees }: { entrees: EntreeSemaine[] }) {
  const [reference, setReference] = useState(() => new Date());
  const lundi = lundiDeLaSemaine(reference);
  const jours = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(lundi);
    d.setDate(d.getDate() + i);
    return d;
  });

  const entreesSemaine = entrees.filter((e) => {
    const d = new Date(e.date);
    return d >= jours[0] && d.getTime() < jours[6].getTime() + 24 * 3_600_000;
  });

  const lignes = [...new Set(entreesSemaine.map((e) => e.ligne))].sort();

  const heuresPour = (ligne: string, jour: Date) =>
    arrondir(
      entreesSemaine
        .filter((e) => e.ligne === ligne && new Date(e.date).toDateString() === jour.toDateString())
        .reduce((s, e) => s + e.dureeHeures, 0)
    );
  const totalLigne = (ligne: string) => arrondir(jours.reduce((s, j) => s + heuresPour(ligne, j), 0));
  const totalJour = (jour: Date) => arrondir(lignes.reduce((s, ligne) => s + heuresPour(ligne, jour), 0));
  const totalGeneral = arrondir(lignes.reduce((s, ligne) => s + totalLigne(ligne), 0));

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={() =>
            setReference((d) => {
              const n = new Date(d);
              n.setDate(n.getDate() - 7);
              return n;
            })
          }
          aria-label="Semaine précédente"
        >
          <ChevronLeft className="size-4" aria-hidden />
        </Button>
        <p className="text-sm font-medium">
          Semaine du {new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(jours[0])} au{" "}
          {new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(jours[6])}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={() =>
            setReference((d) => {
              const n = new Date(d);
              n.setDate(n.getDate() + 7);
              return n;
            })
          }
          aria-label="Semaine suivante"
        >
          <ChevronRight className="size-4" aria-hidden />
        </Button>
      </div>

      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Projet</th>
              {jours.map((j, i) => (
                <th key={i} className="px-2 py-2 text-center font-medium text-muted-foreground">
                  {JOURS_COURTS[i]} {j.getDate()}
                </th>
              ))}
              <th className="px-3 py-2 text-right font-medium text-muted-foreground">Total</th>
            </tr>
          </thead>
          <tbody>
            {lignes.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-6 text-center text-muted-foreground">
                  Aucune heure cette semaine.
                </td>
              </tr>
            ) : (
              lignes.map((ligne) => (
                <tr key={ligne} className="border-b last:border-0">
                  <td className="max-w-48 truncate px-3 py-2">{ligne}</td>
                  {jours.map((j, i) => {
                    const h = heuresPour(ligne, j);
                    return (
                      <td key={i} className="px-2 py-2 text-center tabular-nums text-muted-foreground">
                        {h > 0 ? `${h}h` : "—"}
                      </td>
                    );
                  })}
                  <td className="px-3 py-2 text-right font-medium tabular-nums">{totalLigne(ligne)}h</td>
                </tr>
              ))
            )}
          </tbody>
          {lignes.length > 0 ? (
            <tfoot>
              <tr className="border-t bg-muted/30">
                <td className="px-3 py-2 font-medium">Total</td>
                {jours.map((j, i) => {
                  const h = totalJour(j);
                  return (
                    <td key={i} className="px-2 py-2 text-center font-medium tabular-nums">
                      {h > 0 ? `${h}h` : "—"}
                    </td>
                  );
                })}
                <td className="px-3 py-2 text-right font-semibold tabular-nums">{totalGeneral}h</td>
              </tr>
            </tfoot>
          ) : null}
        </table>
      </Card>
    </div>
  );
}
