"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LogOut, Users, UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { ajouterMembreGroupe, retirerMembreGroupe } from "@/lib/actions/messagerie";
import type { MembreCanal } from "@/lib/messagerie/acces";

/**
 * Membres d'un groupe privé. Le créateur ajoute et retire des membres ; chaque membre peut quitter le groupe (sauf
 * le créateur). Les droits sont revérifiés côté serveur par chaque action.
 */
export function GestionGroupe({
  canalId,
  membres,
  aAjouter,
  moiId,
  createurId,
}: {
  canalId: string;
  membres: MembreCanal[];
  /** Collègues qui ne sont pas encore dans le groupe. */
  aAjouter: MembreCanal[];
  moiId: string;
  createurId: string | null;
}) {
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [enCours, startTransition] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);
  const [choix, setChoix] = useState("");
  const estCreateur = moiId === createurId;

  function executer(action: () => Promise<{ erreur?: string }>, apres?: () => void) {
    setErreur(null);
    startTransition(async () => {
      const resultat = await action();
      if (resultat.erreur) return setErreur(resultat.erreur);
      apres?.();
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <Button type="button" variant="outline" size="sm" onClick={() => setOuvert((v) => !v)} aria-expanded={ouvert} className="w-fit">
        <Users data-icon="inline-start" aria-hidden />
        {membres.length} membre{membres.length > 1 ? "s" : ""}
      </Button>

      {ouvert ? (
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3 text-sm">
          <ul className="flex flex-col gap-1">
            {membres.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-2">
                <span className="truncate">
                  {m.nom}
                  {m.id === moiId ? " (vous)" : ""}
                  {m.id === createurId ? <span className="ml-1.5 rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">Créateur</span> : null}
                </span>
                {estCreateur && m.id !== createurId ? (
                  <button type="button" disabled={enCours} onClick={() => executer(() => retirerMembreGroupe(canalId, m.id))} aria-label={`Retirer ${m.nom} du groupe`} className="rounded p-0.5 hover:bg-muted">
                    <X className="size-3.5 text-muted-foreground hover:text-destructive" aria-hidden />
                  </button>
                ) : null}
              </li>
            ))}
          </ul>

          {estCreateur && aAjouter.length > 0 ? (
            <div className="flex items-center gap-2">
              <Select value={choix} onChange={(e) => setChoix(e.target.value)} aria-label="Ajouter un collègue au groupe" className="h-8 flex-1">
                <option value="">Ajouter un collègue…</option>
                {aAjouter.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nom}
                  </option>
                ))}
              </Select>
              <Button type="button" size="sm" disabled={!choix || enCours} onClick={() => executer(() => ajouterMembreGroupe(canalId, choix), () => setChoix(""))}>
                <UserPlus data-icon="inline-start" aria-hidden />
                Ajouter
              </Button>
            </div>
          ) : null}

          {!estCreateur ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={enCours}
              onClick={() => {
                if (window.confirm("Quitter ce groupe ? Vous ne verrez plus ses messages.")) executer(() => retirerMembreGroupe(canalId, moiId), () => router.push("/app/messagerie"));
              }}
              className="w-fit text-muted-foreground hover:text-destructive"
            >
              <LogOut data-icon="inline-start" aria-hidden />
              Quitter le groupe
            </Button>
          ) : null}
          {erreur ? <p className="text-xs text-destructive">{erreur}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
