"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { creerContact } from "@/lib/actions/contact";

export function FormulaireNouveauContact({ comptes }: { comptes: { id: string; nom: string }[] }) {
  const [etat, action, enCours] = useActionState(creerContact, null);

  return (
    <Card className="max-w-lg">
      <CardHeader>
        <CardTitle>Nouveau contact</CardTitle>
        <CardDescription>Pour un client déjà connu, sans passer par un lead.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="nom">Nom</Label>
            <Input id="nom" name="nom" required minLength={2} />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="compteId">Compte (société, si B2B)</Label>
            <Select id="compteId" name="compteId" defaultValue="">
              <option value="">Aucun</option>
              {comptes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nom}
                </option>
              ))}
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="fonction">Fonction</Label>
            <Input id="fonction" name="fonction" placeholder="ex : Directeur achats" />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="telephone">Téléphone (WhatsApp de préférence)</Label>
            <Input id="telephone" name="telephone" required />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" name="notes" rows={3} />
          </div>

          {etat?.erreur ? <p className="text-sm text-destructive">{etat.erreur}</p> : null}

          <Button type="submit" disabled={enCours}>
            {enCours ? <Spinner /> : null}
            {enCours ? "Création…" : "Créer le contact"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
