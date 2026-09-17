"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { soumettreReponseFormulaire } from "@/lib/actions/one-form";

type Champ = { id: string; type: string; libelle: string; obligatoire: boolean; options: string[] | null };

export function FormulaireRemplissagePublic({ slug, champs, messageConfirmation }: { slug: string; champs: Champ[]; messageConfirmation: string }) {
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoye, setEnvoye] = useState(false);
  const [enCours, startTransition] = useTransition();

  if (envoye) {
    return <p className="text-sm text-emerald-700">{messageConfirmation}</p>;
  }

  function envoyer(formData: FormData) {
    setErreur(null);
    startTransition(async () => {
      const resultat = await soumettreReponseFormulaire(slug, formData);
      if (resultat.erreur) setErreur(resultat.erreur);
      else setEnvoye(true);
    });
  }

  return (
    <form action={envoyer} className="flex flex-col gap-4">
      {champs.map((champ) => (
        <div key={champ.id} className="flex flex-col gap-2">
          <Label htmlFor={champ.id}>
            {champ.libelle}
            {champ.obligatoire ? <span className="text-destructive"> *</span> : null}
          </Label>
          <ChampFormulaire champ={champ} />
        </div>
      ))}

      {erreur ? <p className="text-sm text-destructive">{erreur}</p> : null}

      <Button type="submit" disabled={enCours} className="w-full">
        {enCours ? <Spinner /> : null}
        {enCours ? "Envoi…" : "Envoyer"}
      </Button>
    </form>
  );
}

function ChampFormulaire({ champ }: { champ: Champ }) {
  const requis = champ.obligatoire;

  switch (champ.type) {
    case "TEXTE_LONG":
      return <Textarea id={champ.id} name={champ.id} rows={4} required={requis} />;
    case "EMAIL":
      return <Input id={champ.id} name={champ.id} type="email" required={requis} />;
    case "TELEPHONE":
      return <Input id={champ.id} name={champ.id} type="tel" required={requis} />;
    case "NOMBRE":
      return <Input id={champ.id} name={champ.id} type="number" required={requis} />;
    case "DATE":
      return <Input id={champ.id} name={champ.id} type="date" required={requis} />;
    case "LISTE_DEROULANTE":
      return (
        <Select id={champ.id} name={champ.id} required={requis} defaultValue="">
          <option value="" disabled>
            Sélectionnez…
          </option>
          {(champ.options ?? []).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </Select>
      );
    case "CHOIX_UNIQUE":
      return (
        <div className="flex flex-col gap-1.5">
          {(champ.options ?? []).map((o) => (
            <label key={o} className="flex items-center gap-2 text-sm">
              <input type="radio" name={champ.id} value={o} required={requis} className="size-4" />
              {o}
            </label>
          ))}
        </div>
      );
    case "CHOIX_MULTIPLE":
      return (
        <div className="flex flex-col gap-1.5">
          {(champ.options ?? []).map((o) => (
            <label key={o} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name={champ.id} value={o} className="size-4" />
              {o}
            </label>
          ))}
        </div>
      );
    default:
      return <Input id={champ.id} name={champ.id} type="text" required={requis} />;
  }
}
