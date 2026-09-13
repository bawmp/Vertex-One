"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { configurerParametresRecrutement } from "@/lib/actions/recrutement";

type Params = { slug: string; titre: string; texte: string | null } | null;

export function FormulaireParametresRecrutement({ params }: { params: Params }) {
  const [etat, action, enCours] = useActionState(configurerParametresRecrutement, null);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Configuration de la page publique</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={action} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="slug">Lien (partie de l&apos;URL)</Label>
            <Input id="slug" name="slug" placeholder="mon-entreprise" defaultValue={params?.slug ?? ""} required className="max-w-64" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="titre">Titre affiché aux candidats</Label>
            <Input id="titre" name="titre" defaultValue={params?.titre ?? "Nos offres d'emploi"} required className="max-w-96" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="texte">Texte d&apos;accueil (optionnel)</Label>
            <Input id="texte" name="texte" defaultValue={params?.texte ?? ""} />
          </div>

          {etat?.erreur ? <p className="text-sm text-destructive">{etat.erreur}</p> : null}

          <Button type="submit" disabled={enCours} className="self-start">
            {enCours ? <Spinner /> : null}
            {enCours ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
