"use client";

import { useActionState, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { creerPolitiqueConge } from "@/lib/actions/politique-conge";
import { useT } from "@/lib/i18n/contexte";

export function FormulaireNouvellePolitique() {
  const t = useT();
  const [etat, action, enCours] = useActionState(creerPolitiqueConge, null);
  const [ouvert, setOuvert] = useState(false);

  if (!ouvert) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOuvert(true)} className="self-start">
        <Plus data-icon="inline-start" aria-hidden />
        {t("Nouvelle politique")}
      </Button>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("Nouvelle politique de congé")}</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={action} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="nom">{t("Nom")}</Label>
            <Input id="nom" name="nom" placeholder={t("Congé payé standard")} required />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="type">{t("Type")}</Label>
              <Select id="type" name="type" defaultValue="FIXE">
                <option value="FIXE">{t("Fixe")}</option>
                <option value="ANCIENNETE">{t("Par ancienneté")}</option>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="joursBaseParAn">{t("Jours de base par an")}</Label>
              <Input id="joursBaseParAn" name="joursBaseParAn" type="number" min={0} required />
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
