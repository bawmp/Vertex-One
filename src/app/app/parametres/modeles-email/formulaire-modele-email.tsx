"use client";

import { useActionState } from "react";
import { Save, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { enregistrerModeleEmail } from "@/lib/actions/modele-email";
import type { TypeModeleEmail } from "@/lib/email/modeles";

export function FormulaireModeleEmail({
  type,
  titre,
  objet,
  corps,
}: {
  type: TypeModeleEmail;
  titre: string;
  objet: string;
  corps: string;
}) {
  const [etat, action, enCours] = useActionState(enregistrerModeleEmail, null);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{titre}</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={action} className="flex flex-col gap-4">
          <input type="hidden" name="type" value={type} />

          <div className="flex flex-col gap-2">
            <Label htmlFor={`objet-${type}`}>Objet</Label>
            <Input id={`objet-${type}`} name="objet" required defaultValue={objet} />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor={`corps-${type}`}>Message</Label>
            <Textarea id={`corps-${type}`} name="corps" required defaultValue={corps} rows={7} />
          </div>

          {etat?.erreur ? <p className="text-sm text-destructive">{etat.erreur}</p> : null}
          {etat?.enregistre ? (
            <p className="flex items-center gap-1.5 text-sm text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="size-4" aria-hidden />
              Modèle enregistré.
            </p>
          ) : null}

          <Button type="submit" disabled={enCours} className="self-start">
            {enCours ? <Spinner /> : <Save data-icon="inline-start" aria-hidden />}
            {enCours ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
