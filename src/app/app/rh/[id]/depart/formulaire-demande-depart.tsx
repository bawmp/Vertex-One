"use client";

import { useActionState, useState } from "react";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { creerDemandeDepart } from "@/lib/actions/depart";
import { useT } from "@/lib/i18n/contexte";

export function FormulaireDemandeDepart() {
  const t = useT();
  const [etat, action, enCours] = useActionState(creerDemandeDepart, null);
  const [ouvert, setOuvert] = useState(false);

  if (!ouvert) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOuvert(true)}>
        <LogOut data-icon="inline-start" aria-hidden />
        {t("Faire une demande de départ")}
      </Button>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("Faire une demande de départ")}</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={action} className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="type">{t("Type")}</Label>
              <Select id="type" name="type" defaultValue="DEMISSION">
                <option value="DEMISSION">{t("Démission")}</option>
                <option value="LICENCIEMENT">{t("Licenciement")}</option>
                <option value="FIN_CONTRAT">{t("Fin de contrat")}</option>
                <option value="AUTRE">{t("Autre")}</option>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="dateDepartSouhaitee">{t("Date de départ souhaitée")}</Label>
              <Input id="dateDepartSouhaitee" name="dateDepartSouhaitee" type="date" required />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="motif">{t("Motif (optionnel)")}</Label>
            <Textarea id="motif" name="motif" rows={2} />
          </div>

          {etat?.erreur ? <p className="text-sm text-destructive">{etat.erreur}</p> : null}

          <div className="flex gap-2">
            <Button type="submit" disabled={enCours}>
              {enCours ? <Spinner /> : null}
              {enCours ? t("Envoi…") : t("Envoyer la demande")}
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
