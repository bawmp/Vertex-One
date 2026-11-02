"use client";

import { useState, useTransition } from "react";
import { Check, Pencil, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { renommerCompte, supprimerCompte } from "@/lib/actions/compte-personnalise";

/** Modifier l'intitulé ou supprimer un compte personnalisé de la liste (suppression refusée par le serveur si le compte sert déjà). */
export function ActionsCompte({ compteId, libelle }: { compteId: string; libelle: string }) {
  const [mode, setMode] = useState<"repos" | "renommer" | "confirmer">("repos");
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, startTransition] = useTransition();

  function renommer(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const donnees = new FormData(e.currentTarget);
    setErreur(null);
    startTransition(async () => {
      const r = await renommerCompte(compteId, null, donnees);
      if (r?.erreur) setErreur(r.erreur);
      else setMode("repos");
    });
  }

  function supprimer() {
    setErreur(null);
    startTransition(async () => {
      const r = await supprimerCompte(compteId);
      if (r?.erreur) {
        setErreur(r.erreur);
        setMode("repos");
      }
    });
  }

  if (mode === "renommer") {
    return (
      <form onSubmit={renommer} className="flex items-center gap-1.5">
        <Input name="libelle" defaultValue={libelle} required minLength={2} maxLength={80} aria-label="Nouvel intitulé" className="h-8 w-56" autoFocus />
        <Button type="submit" size="icon-sm" disabled={enCours} aria-label="Enregistrer l'intitulé">
          <Check className="size-4" aria-hidden />
        </Button>
        <Button type="button" size="icon-sm" variant="ghost" onClick={() => { setMode("repos"); setErreur(null); }} aria-label="Annuler">
          <X className="size-4" aria-hidden />
        </Button>
        {erreur ? <span role="alert" className="text-xs text-destructive">{erreur}</span> : null}
      </form>
    );
  }

  if (mode === "confirmer") {
    return (
      <span className="flex items-center gap-1.5 text-xs">
        Supprimer ce compte ?
        <Button type="button" size="sm" variant="destructive" disabled={enCours} onClick={supprimer}>
          Oui, supprimer
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setMode("repos")}>
          Non
        </Button>
      </span>
    );
  }

  return (
    <span className="flex flex-col items-end gap-1">
      <span className="flex items-center">
        <Button type="button" variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-primary" onClick={() => setMode("renommer")} aria-label={`Modifier l'intitulé de ${libelle}`}>
          <Pencil className="size-4" aria-hidden />
        </Button>
        <Button type="button" variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-destructive" onClick={() => setMode("confirmer")} aria-label={`Supprimer ${libelle}`}>
          <Trash2 className="size-4" aria-hidden />
        </Button>
      </span>
      {erreur ? <span role="alert" className="max-w-72 text-right text-xs text-destructive">{erreur}</span> : null}
    </span>
  );
}
