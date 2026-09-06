"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ajouterInteraction } from "@/lib/actions/contact";

export function FormulaireInteraction({ contactId }: { contactId: string }) {
  const [etat, action, enCours] = useActionState(ajouterInteraction, null);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Nouvelle interaction</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={action} className="flex flex-col gap-3">
          <input type="hidden" name="contactId" value={contactId} />

          <div className="flex flex-col gap-2">
            <Label htmlFor="type">Type</Label>
            <Select id="type" name="type" defaultValue="note" className="max-w-56">
              <option value="appel">Appel</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="email">Email</option>
              <option value="rendez-vous">Rendez-vous</option>
              <option value="note">Note</option>
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="contenu">Note</Label>
            <Textarea id="contenu" name="contenu" required rows={3} />
          </div>

          {etat?.erreur ? <p className="text-sm text-destructive">{etat.erreur}</p> : null}

          <Button type="submit" disabled={enCours} className="self-start">
            {enCours ? <Spinner /> : null}
            {enCours ? "Ajout…" : "Ajouter"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
