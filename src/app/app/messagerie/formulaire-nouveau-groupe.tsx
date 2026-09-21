"use client";

import { useActionState, useState } from "react";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { creerGroupePrive } from "@/lib/actions/messagerie";
import type { Collegue } from "@/lib/messagerie/acces";
import { useT } from "@/lib/i18n/contexte";

/** Création d'un groupe privé : un nom et les collègues à inviter. Seuls ses membres le verront. */
export function FormulaireNouveauGroupe({ collegues }: { collegues: Pick<Collegue, "id" | "nom">[] }) {
  const t = useT();
  const [etat, action, enCours] = useActionState(creerGroupePrive, null);
  const [ouvert, setOuvert] = useState(false);

  if (!ouvert) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => setOuvert(true)} className="w-full">
        <Lock data-icon="inline-start" aria-hidden />
        {t("Nouveau groupe privé")}
      </Button>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-2 rounded-lg border border-border p-2">
      <Input name="nom" placeholder={t("Nom du groupe")} required minLength={2} maxLength={60} autoFocus aria-label={t("Nom du groupe")} />
      <fieldset className="flex max-h-44 flex-col gap-0.5 overflow-y-auto">
        <legend className="mb-1 text-xs text-muted-foreground">{t("Inviter (visible de ses seuls membres)")}</legend>
        {collegues.length === 0 ? <p className="text-xs text-muted-foreground">{t("Aucun collègue à inviter pour l'instant.")}</p> : null}
        {collegues.map((c) => (
          <label key={c.id} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-muted">
            <input type="checkbox" name="membres" value={c.id} className="size-4 accent-primary" />
            <span className="truncate">{c.nom}</span>
          </label>
        ))}
      </fieldset>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={enCours}>
          {enCours ? <Spinner /> : t("Créer le groupe")}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOuvert(false)}>
          {t("Annuler")}
        </Button>
      </div>
      {etat?.erreur ? <p className="text-xs text-destructive">{etat.erreur}</p> : null}
    </form>
  );
}
