"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { renommerEntreprise } from "@/lib/actions/entreprise-nom";
import { useT } from "@/lib/i18n/contexte";

export function FormulaireNom({ nom }: { nom: string }) {
  const t = useT();
  const [etat, action, enCours] = useActionState(renommerEntreprise, null);

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="nom">{t("Nom de l'entreprise")}</Label>
        <Input id="nom" name="nom" required defaultValue={nom} />
      </div>

      {etat?.erreur ? <p className="text-sm text-destructive">{etat.erreur}</p> : null}
      {etat?.succes ? <p className="text-sm text-emerald-600">{etat.succes}</p> : null}

      <Button type="submit" disabled={enCours} className="w-fit">
        {enCours ? <Spinner /> : null}
        {enCours ? t("Enregistrement…") : t("Enregistrer")}
      </Button>
    </form>
  );
}
