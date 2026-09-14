"use client";

import { useState, useTransition } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { enregistrerMaNote } from "@/lib/actions/note-personnelle";

/**
 * Sauvegarde automatique sur onBlur (pas de bouton "Enregistrer") — un
 * bloc-notes n'a pas besoin d'un aller-retour explicite, contrairement à un
 * formulaire structuré.
 */
export function BlocNotes({ contenuInitial }: { contenuInitial: string }) {
  const [contenu, setContenu] = useState(contenuInitial);
  const [enCours, startTransition] = useTransition();

  function enregistrer() {
    if (contenu === contenuInitial) return;
    startTransition(() => enregistrerMaNote(contenu));
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Textarea
        value={contenu}
        onChange={(e) => setContenu(e.target.value)}
        onBlur={enregistrer}
        rows={6}
        placeholder="Notes privées, visibles par vous seul…"
      />
      {enCours ? (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Spinner className="size-3" /> Enregistrement…
        </p>
      ) : null}
    </div>
  );
}
