"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { assignerPolitiqueConge } from "@/lib/actions/politique-conge";
import { useT } from "@/lib/i18n/contexte";

export function FormulairePolitiqueConge({
  dossierRHId,
  politiqueCongeId,
  politiques,
}: {
  dossierRHId: string;
  politiqueCongeId: string | null;
  politiques: { id: string; nom: string }[];
}) {
  const t = useT();
  const [etat, action, enCours] = useActionState(assignerPolitiqueConge, null);

  return (
    <form action={action} className="flex items-end gap-2">
      <input type="hidden" name="dossierRHId" value={dossierRHId} />
      <div className="flex flex-col gap-1">
        <Label htmlFor="politiqueCongeId">{t("Politique de congé")}</Label>
        <Select id="politiqueCongeId" name="politiqueCongeId" defaultValue={politiqueCongeId ?? ""} className="w-56">
          <option value="">{t("Aucune (solde géré à la main)")}</option>
          {politiques.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nom}
            </option>
          ))}
        </Select>
      </div>
      <Button type="submit" size="sm" variant="outline" disabled={enCours}>
        {enCours ? <Spinner className="size-3.5" /> : null}
        {t("Assigner")}
      </Button>
      {etat?.erreur ? <p className="text-sm text-destructive">{etat.erreur}</p> : null}
    </form>
  );
}
