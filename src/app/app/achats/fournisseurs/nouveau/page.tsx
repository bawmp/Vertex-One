"use client";

import { useActionState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { creerFournisseur } from "@/lib/actions/fournisseur";

export default function PageNouveauFournisseur() {
  const [etat, action, enCours] = useActionState(creerFournisseur, null);

  return (
    <div className="flex max-w-lg flex-col gap-4">
      <Link href="/app/achats" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" aria-hidden />
        Achats
      </Link>

      <Card>
        <CardHeader>
          <CardTitle>Nouveau fournisseur</CardTitle>
          <CardDescription>Pour émettre des dépenses ou des factures fournisseur à son nom.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={action} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="nom">Nom</Label>
              <Input id="nom" name="nom" required minLength={2} />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="niu">NIU</Label>
              <Input id="niu" name="niu" placeholder="ex : M012345678901X" />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="telephone">Téléphone</Label>
              <Input id="telephone" name="telephone" required />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="adresse">Adresse</Label>
              <Input id="adresse" name="adresse" />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" name="notes" rows={3} />
            </div>

            {etat?.erreur ? <p className="text-sm text-destructive">{etat.erreur}</p> : null}

            <Button type="submit" disabled={enCours}>
              {enCours ? <Spinner /> : null}
              {enCours ? "Création…" : "Créer le fournisseur"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
