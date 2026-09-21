"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { creerDeal } from "@/lib/actions/deal";
import { useT } from "@/lib/i18n/contexte";

type Contact = { id: string; nom: string; compteNom: string | null };

export function FormulaireNouveauDeal({ contacts, contactIdPreselectionne }: { contacts: Contact[]; contactIdPreselectionne?: string }) {
  const t = useT();
  const [etat, action, enCours] = useActionState(creerDeal, null);

  return (
    <Card className="max-w-lg">
      <CardHeader>
        <CardTitle>{t("Nouveau deal")}</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={action} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="titre">{t("Titre")}</Label>
            <Input id="titre" name="titre" required minLength={2} autoFocus />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="contactId">{t("Contact")}</Label>
            <Select id="contactId" name="contactId" defaultValue={contactIdPreselectionne ?? ""} required>
              <option value="" disabled>
                {t("Choisir un contact")}
              </option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nom}
                  {c.compteNom ? ` (${c.compteNom})` : ""}
                </option>
              ))}
            </Select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="montant">{t("Montant (FCFA)")}</Label>
              <Input id="montant" name="montant" type="number" min={0} defaultValue={0} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="dateClotureEstimee">{t("Clôture estimée")}</Label>
              <Input id="dateClotureEstimee" name="dateClotureEstimee" type="date" />
            </div>
          </div>

          {etat?.erreur ? <p className="text-sm text-destructive">{etat.erreur}</p> : null}

          <Button type="submit" disabled={enCours}>
            {enCours ? <Spinner /> : null}
            {enCours ? t("Création…") : t("Créer le deal")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
