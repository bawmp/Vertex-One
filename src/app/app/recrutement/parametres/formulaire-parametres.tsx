"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { configurerParametresRecrutement } from "@/lib/actions/recrutement";

type Params = { slug: string; titre: string; texte: string | null; avantages: string[] | null } | null;

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
            <Textarea id="texte" name="texte" rows={3} defaultValue={params?.texte ?? ""} placeholder="Qui êtes-vous ? Pourquoi rejoindre votre équipe ?" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="avantages">Ce que vous offrez (un atout par ligne, 8 maximum)</Label>
            <Textarea
              id="avantages"
              name="avantages"
              rows={5}
              defaultValue={(params?.avantages ?? []).join("\n")}
              placeholder={"Une équipe soudée et bienveillante\nDes formations régulières\nUn cadre de travail agréable"}
            />
            <p className="text-xs text-muted-foreground">Affichés en cartes colorées sur votre page. Sans atout saisi, cette section n&apos;apparaît pas.</p>
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
