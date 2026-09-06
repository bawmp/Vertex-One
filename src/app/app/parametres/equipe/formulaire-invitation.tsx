"use client";

import { useActionState } from "react";
import { Send, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { creerInvitation } from "@/lib/actions/invitation";

export function FormulaireInvitation() {
  const [etat, action, enCours] = useActionState(creerInvitation, null);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Inviter un collaborateur</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={action} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">Email de l&apos;invité</Label>
            <Input id="email" name="email" type="email" required />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="roleProposee">Rôle</Label>
            <Select id="roleProposee" name="roleProposee" required defaultValue="EMPLOYE">
              <option value="MANAGER">Manager</option>
              <option value="EMPLOYE">Employé</option>
              <option value="CLIENT">Client</option>
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="postePropose">Poste</Label>
            <Input id="postePropose" name="postePropose" placeholder="Ex : Chargé de clientèle" />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="typeContratPropose">Type de contrat</Label>
            <Select id="typeContratPropose" name="typeContratPropose" defaultValue="CDI">
              <option value="CDI">CDI</option>
              <option value="CDD">CDD</option>
              <option value="STAGE">Stage</option>
              <option value="PRESTATAIRE">Prestataire</option>
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="dateEmbauchePropose">Date d&apos;embauche réelle</Label>
            <Input id="dateEmbauchePropose" name="dateEmbauchePropose" type="date" />
          </div>

          {etat?.erreur ? <p className="text-sm text-destructive">{etat.erreur}</p> : null}
          {etat?.succes ? (
            <p className="flex items-center gap-1.5 text-sm text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="size-4" aria-hidden />
              {etat.succes}
            </p>
          ) : null}

          <Button type="submit" disabled={enCours} className="self-start">
            {enCours ? <Spinner /> : <Send data-icon="inline-start" aria-hidden />}
            {enCours ? "Envoi…" : "Inviter"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
