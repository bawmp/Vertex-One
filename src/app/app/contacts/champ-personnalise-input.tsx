"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { TYPES_CHAMP_CONTACT } from "@/lib/contact-champs-personnalises-types";

export type ChampContactDef = {
  id: string;
  libelle: string;
  type: (typeof TYPES_CHAMP_CONTACT)[number];
  obligatoire: boolean;
  options?: string[] | null;
};

/**
 * Un champ par entreprise (voir contactChampPersonnalise, src/db/schema.ts) — le nom
 * DOM `champ_<id>` (pas le libellé, modifiable) est ce que lisent creerContact() et
 * modifierValeursChampsPersonnalisesContact() côté serveur.
 */
export function ChampPersonnaliseInput({ champ, defaultValue }: { champ: ChampContactDef; defaultValue?: string }) {
  const nom = `champ_${champ.id}`;

  if (champ.type === "CASE_A_COCHER") {
    return (
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name={nom} defaultChecked={defaultValue === "oui"} className="size-4" />
        {champ.libelle}
      </label>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={nom}>
        {champ.libelle}
        {champ.obligatoire ? " *" : ""}
      </Label>
      {champ.type === "TEXTE_LONG" ? (
        <Textarea id={nom} name={nom} rows={3} defaultValue={defaultValue} required={champ.obligatoire} />
      ) : champ.type === "LISTE_DEROULANTE" ? (
        <Select id={nom} name={nom} defaultValue={defaultValue ?? ""} required={champ.obligatoire}>
          <option value="">—</option>
          {(champ.options ?? []).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </Select>
      ) : (
        <Input
          id={nom}
          name={nom}
          type={champ.type === "NOMBRE" ? "number" : champ.type === "DATE" ? "date" : champ.type === "EMAIL" ? "email" : champ.type === "TELEPHONE" ? "tel" : "text"}
          defaultValue={defaultValue}
          required={champ.obligatoire}
        />
      )}
    </div>
  );
}
