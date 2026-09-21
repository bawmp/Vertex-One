"use client";

import { useState, useTransition } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useT } from "@/lib/i18n/contexte";

export function EditeurNotes({
  notesInitiales,
  onEnregistrer,
}: {
  notesInitiales: string | null;
  onEnregistrer: (notes: string) => Promise<void>;
}) {
  const t = useT();
  const [notes, setNotes] = useState(notesInitiales ?? "");
  const [enCours, demarrer] = useTransition();
  const modifie = notes !== (notesInitiales ?? "");

  return (
    <div className="flex flex-col gap-2">
      <Textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={3}
        placeholder={t("Notes libres…")}
        aria-label={t("Notes")}
      />
      {modifie ? (
        <Button size="sm" variant="outline" disabled={enCours} onClick={() => demarrer(() => onEnregistrer(notes))} className="self-start">
          {enCours ? <Spinner /> : null}
          {enCours ? t("Enregistrement…") : t("Enregistrer les notes")}
        </Button>
      ) : null}
    </div>
  );
}
