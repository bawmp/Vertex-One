"use client";

import { useTransition } from "react";
import { LifeBuoy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { activerAddon } from "@/lib/actions/addon";

export function BoutonActiverSupport() {
  const [enCours, demarrer] = useTransition();

  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <LifeBuoy className="size-4" aria-hidden />
          Module Assistance client
        </CardTitle>
        <CardDescription>
          Un portail où vos clients ouvrent et suivent leurs propres tickets — module complémentaire à la carte,
          indépendant de votre forfait actuel (10 000 FCFA/mois).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button disabled={enCours} onClick={() => demarrer(() => activerAddon("SUPPORT"))}>
          {enCours ? <Spinner /> : null}
          {enCours ? "Activation…" : "Activer le module Assistance client"}
        </Button>
      </CardContent>
    </Card>
  );
}
