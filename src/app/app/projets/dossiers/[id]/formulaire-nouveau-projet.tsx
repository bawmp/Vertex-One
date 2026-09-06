"use client";

import { useActionState, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { creerProjet } from "@/lib/actions/projet";
import type { VocabulaireEntree } from "@/lib/vocabulaire";

export function FormulaireNouveauProjet({ dossierId, vocab }: { dossierId: string; vocab: VocabulaireEntree }) {
  const [etat, action, enCours] = useActionState(creerProjet, null);
  const [ouvert, setOuvert] = useState(false);

  if (!ouvert) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOuvert(true)}>
        <Plus data-icon="inline-start" aria-hidden />
        Nouveau {vocab.singulier.toLowerCase()}
      </Button>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Nouveau {vocab.singulier.toLowerCase()}</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={action} className="flex flex-col gap-4">
          <input type="hidden" name="dossierId" value={dossierId} />

          <div className="flex flex-col gap-2">
            <Label htmlFor="titre">Titre</Label>
            <Input id="titre" name="titre" required minLength={2} autoFocus />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" name="description" rows={3} />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="dateEcheance">Échéance</Label>
            <Input id="dateEcheance" name="dateEcheance" type="date" className="max-w-48" />
          </div>

          {etat?.erreur ? <p className="text-sm text-destructive">{etat.erreur}</p> : null}

          <div className="flex gap-2">
            <Button type="submit" disabled={enCours}>
              {enCours ? <Spinner /> : null}
              {enCours ? "Création…" : "Créer"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setOuvert(false)}>
              Annuler
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
