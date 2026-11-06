"use client";

import { useActionState, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { creerShift } from "@/lib/actions/shift";
import { useT } from "@/lib/i18n/contexte";

export function FormulaireNouveauShift() {
  const t = useT();
  const [etat, action, enCours] = useActionState(creerShift, null);
  const [ouvert, setOuvert] = useState(false);

  if (!ouvert) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOuvert(true)} className="self-start">
        <Plus data-icon="inline-start" aria-hidden />
        {t("Nouveau shift")}
      </Button>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("Nouveau shift")}</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={action} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="nom">{t("Nom")}</Label>
            <Input id="nom" name="nom" placeholder={t("Matin")} required className="max-w-48" />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="heureDebut">{t("Début")}</Label>
              <Input id="heureDebut" name="heureDebut" type="time" required />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="heureFin">{t("Fin")}</Label>
              <Input id="heureFin" name="heureFin" type="time" required />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="toleranceMinutes">{t("Tolérance (min)")}</Label>
              <Input id="toleranceMinutes" name="toleranceMinutes" type="number" min={0} defaultValue={0} />
            </div>
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
