"use client";

import { useActionState, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { creerCanalLibre } from "@/lib/actions/messagerie";
import { useT } from "@/lib/i18n/contexte";

export function FormulaireNouveauCanal() {
  const t = useT();
  const [etat, action, enCours] = useActionState(creerCanalLibre, null);
  const [ouvert, setOuvert] = useState(false);

  if (!ouvert) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => setOuvert(true)} className="w-full">
        <Plus data-icon="inline-start" aria-hidden />
        {t("Nouveau canal")}
      </Button>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-2 rounded-lg border border-border p-2">
      <Input name="nom" placeholder={t("ex : Annonces, Idées…")} required minLength={2} maxLength={60} autoFocus aria-label={t("Nom du canal")} />
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={enCours}>
          {enCours ? <Spinner /> : t("Créer")}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOuvert(false)}>
          {t("Annuler")}
        </Button>
      </div>
      {etat?.erreur ? <p className="text-xs text-destructive">{etat.erreur}</p> : null}
    </form>
  );
}
