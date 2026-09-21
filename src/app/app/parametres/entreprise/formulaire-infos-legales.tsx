"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { enregistrerInfosLegales } from "@/lib/actions/entreprise-legal";
import type { entreprise } from "@/db/schema";
import { useT } from "@/lib/i18n/contexte";

export function FormulaireInfosLegales({ entreprise: monEntreprise }: { entreprise: typeof entreprise.$inferSelect }) {
  const t = useT();
  const [etat, action, enCours] = useActionState(enregistrerInfosLegales, null);

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="niu">{t("NIU (Numéro d'Identifiant Unique)")}</Label>
        <Input id="niu" name="niu" required defaultValue={monEntreprise.niu ?? ""} />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="rccm">RCCM</Label>
        <Input id="rccm" name="rccm" defaultValue={monEntreprise.rccm ?? ""} />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="adresse">{t("Adresse")}</Label>
        <Input id="adresse" name="adresse" defaultValue={monEntreprise.adresse ?? ""} />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="ville">{t("Ville")}</Label>
        <Input id="ville" name="ville" defaultValue={monEntreprise.ville ?? ""} />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="assujettiTVA">{t("Assujetti à la TVA (19,25%)")}</Label>
        <Select id="assujettiTVA" name="assujettiTVA" defaultValue={monEntreprise.assujettiTVA ? "oui" : "non"}>
          <option value="oui">{t("Oui")}</option>
          <option value="non">{t("Non — régime simplifié / exonéré")}</option>
        </Select>
      </div>

      {etat?.erreur ? <p className="text-sm text-destructive">{etat.erreur}</p> : null}

      <Button type="submit" disabled={enCours}>
        {enCours ? <Spinner /> : null}
        {enCours ? t("Enregistrement…") : t("Enregistrer")}
      </Button>
    </form>
  );
}
