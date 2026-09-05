"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { creerEntreprise } from "@/lib/actions/entreprise";

export default function PageInscription() {
  const [etat, action, enCours] = useActionState(creerEntreprise, null);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Créer votre entreprise sur Vertex One</CardTitle>
        <CardDescription>Le premier compte créé devient Administrateur.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="nomEntreprise">Nom de l&apos;entreprise</Label>
            <Input id="nomEntreprise" name="nomEntreprise" required minLength={2} />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="secteurProfil">Secteur</Label>
            <select
              id="secteurProfil"
              name="secteurProfil"
              required
              defaultValue="generique"
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs"
            >
              <option value="agence">Agence</option>
              <option value="artisan">Artisan</option>
              <option value="cabinet">Cabinet</option>
              <option value="generique">Autre</option>
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="nomComplet">Votre nom complet</Label>
            <Input id="nomComplet" name="nomComplet" required minLength={2} />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" required />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="motDePasse">Mot de passe</Label>
            <Input id="motDePasse" name="motDePasse" type="password" required minLength={8} />
          </div>

          {etat?.erreur ? <p className="text-sm text-destructive">{etat.erreur}</p> : null}

          <Button type="submit" disabled={enCours} className="w-full">
            {enCours ? "Création en cours…" : "Créer mon entreprise"}
          </Button>
        </form>

        <p className="mt-4 text-center text-sm text-muted-foreground">
          Déjà inscrit ?{" "}
          <Link href="/connexion" className="underline underline-offset-4">
            Se connecter
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
