"use client";

import { useActionState, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { creerContrat } from "@/lib/actions/contrat";
import { useT } from "@/lib/i18n/contexte";

export function FormulaireNouveauContrat({ dossierId }: { dossierId: string }) {
  const t = useT();
  const [etat, action, enCours] = useActionState(creerContrat, null);
  const [ouvert, setOuvert] = useState(false);

  if (!ouvert) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOuvert(true)}>
        <Plus data-icon="inline-start" aria-hidden />
        {t("Nouveau contrat")}
      </Button>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("Nouveau contrat")}</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={action} className="flex flex-col gap-4">
          <input type="hidden" name="dossierId" value={dossierId} />

          <div className="flex flex-col gap-2">
            <Label htmlFor="titre">{t("Titre")}</Label>
            <Input id="titre" name="titre" required minLength={2} autoFocus />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="dateDebut">{t("Date de début")}</Label>
              <Input id="dateDebut" name="dateDebut" type="date" required />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="dateFin">{t("Date de fin (optionnelle)")}</Label>
              <Input id="dateFin" name="dateFin" type="date" />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="preavisJours">{t("Préavis avant échéance (jours)")}</Label>
            <Input id="preavisJours" name="preavisJours" type="number" min={0} defaultValue={30} className="max-w-32" />
          </div>

          <div className="flex items-center gap-2">
            <input type="checkbox" id="renouvellementAuto" name="renouvellementAuto" className="size-4 rounded border-input" />
            <Label htmlFor="renouvellementAuto" className="font-normal">
              {t("Renouvellement automatique")}
            </Label>
          </div>

          {etat?.erreur ? <p className="text-sm text-destructive">{etat.erreur}</p> : null}

          <div className="flex gap-2">
            <Button type="submit" disabled={enCours}>
              {enCours ? <Spinner /> : null}
              {enCours ? t("Création…") : t("Créer")}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setOuvert(false)}>
              {t("Annuler")}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
