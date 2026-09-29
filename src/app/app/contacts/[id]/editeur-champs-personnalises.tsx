"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { modifierValeursChampsPersonnalisesContact, type EtatContact } from "@/lib/actions/contact";
import { useT } from "@/lib/i18n/contexte";
import { ChampPersonnaliseInput, type ChampContactDef } from "../champ-personnalise-input";

export function EditeurChampsPersonnalises({ contactId, champs, valeurs }: { contactId: string; champs: ChampContactDef[]; valeurs: Record<string, string> }) {
  const t = useT();
  const action = modifierValeursChampsPersonnalisesContact.bind(null, contactId) as (etat: EtatContact, formData: FormData) => Promise<EtatContact>;
  const [etat, formAction, enCours] = useActionState(action, null);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {champs.map((champ) => (
        <ChampPersonnaliseInput key={champ.id} champ={champ} defaultValue={valeurs[champ.id]} />
      ))}
      {etat?.erreur ? <p className="text-sm text-destructive">{etat.erreur}</p> : null}
      <Button type="submit" size="sm" variant="outline" disabled={enCours} className="self-start">
        {enCours ? <Spinner /> : null}
        {enCours ? t("Enregistrement…") : t("Enregistrer")}
      </Button>
    </form>
  );
}
