"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";

export default function PageConnexion() {
  const router = useRouter();
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  async function seConnecter(formData: FormData) {
    setErreur(null);
    setEnCours(true);

    const { error } = await authClient.signIn.email({
      email: String(formData.get("email")),
      password: String(formData.get("motDePasse")),
    });

    setEnCours(false);

    if (error) {
      setErreur("Email ou mot de passe incorrect.");
      return;
    }

    router.push("/app");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Connexion à Vertex One</CardTitle>
        <CardDescription>Accédez à votre espace entreprise.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={seConnecter} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" required />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="motDePasse">Mot de passe</Label>
            <Input id="motDePasse" name="motDePasse" type="password" required />
          </div>

          {erreur ? <p className="text-sm text-destructive">{erreur}</p> : null}

          <Button type="submit" disabled={enCours} className="w-full">
            {enCours ? "Connexion…" : "Se connecter"}
          </Button>
        </form>

        <p className="mt-4 text-center text-sm text-muted-foreground">
          Pas encore de compte ?{" "}
          <Link href="/inscription" className="underline underline-offset-4">
            Créer votre entreprise
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
