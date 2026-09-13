"use client";

import { useTransition } from "react";
import { Briefcase } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { activerAddon } from "@/lib/actions/addon";

export function BoutonActiverRecrutement() {
  const [enCours, demarrer] = useTransition();

  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Briefcase className="size-4" aria-hidden />
          Module Recrutement
        </CardTitle>
        <CardDescription>
          Une page publique où les candidats postulent seuls, CV inclus — module complémentaire à la carte,
          indépendant de votre forfait actuel (10 000 FCFA/mois).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button disabled={enCours} onClick={() => demarrer(() => activerAddon("RECRUTEMENT"))}>
          {enCours ? <Spinner /> : null}
          {enCours ? "Activation…" : "Activer le module Recrutement"}
        </Button>
      </CardContent>
    </Card>
  );
}
