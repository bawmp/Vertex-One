"use client";

import { useActionState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Champ, ChampSelect } from "@/components/formulaire/champ";
import { ouvrirInventaire } from "@/lib/actions/inventaire-session";
import { useT } from "@/lib/i18n/contexte";

/** Ouvrir un inventaire : un nom (ex. « Inventaire de fin d'année ») et, s'il y a plusieurs dépôts, le dépôt à compter. */
export function FormulaireOuvrirInventaire({ depots }: { depots: { id: string; nom: string; principal: boolean }[] }) {
  const t = useT();
  const [etat, action, enCours] = useActionState(ouvrirInventaire, null);
  return (
    <Card>
      <CardContent>
        <form action={action} className="flex flex-wrap items-start gap-3" aria-label={t("Ouvrir un inventaire")}>
          <Champ label={t("Nom de l'inventaire")} name="nom" required minLength={2} maxLength={80} placeholder={t("Ex. Inventaire de fin d'année")} className="min-w-64 flex-1" />
          {depots.length > 1 ? (
            <ChampSelect label={t("Dépôt à compter")} name="depotId" defaultValue={depots.find((d) => d.principal)?.id} className="w-56">
              {depots.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nom}
                </option>
              ))}
            </ChampSelect>
          ) : null}
          <Button type="submit" disabled={enCours} className="mt-1">
            {enCours ? <Spinner /> : <Plus data-icon="inline-start" aria-hidden />}
            {t("Ouvrir l'inventaire")}
          </Button>
          {etat?.erreur ? <p role="alert" className="basis-full text-sm text-destructive">{etat.erreur}</p> : null}
        </form>
      </CardContent>
    </Card>
  );
}
