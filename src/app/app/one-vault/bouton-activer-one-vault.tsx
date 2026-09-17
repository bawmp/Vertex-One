"use client";

import { useTransition } from "react";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { activerAddon } from "@/lib/actions/addon";

export function BoutonActiverOneVault() {
  const [enCours, demarrer] = useTransition();

  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="size-4" aria-hidden />
          Module One Vault
        </CardTitle>
        <CardDescription>
          Stockez vos identifiants (mots de passe, notes sensibles) chiffrés, privés ou partagés avec l&apos;équipe — module
          complémentaire à la carte, indépendant de votre forfait actuel (10 000 FCFA/mois).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button disabled={enCours} onClick={() => demarrer(() => activerAddon("ONE_VAULT"))}>
          {enCours ? <Spinner /> : null}
          {enCours ? "Activation…" : "Activer le module One Vault"}
        </Button>
      </CardContent>
    </Card>
  );
}
