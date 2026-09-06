"use client";

import { useTransition } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { activerAddon } from "@/lib/actions/addon";

export function BoutonActiverAddon() {
  const [enCours, demarrer] = useTransition();

  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="size-4" aria-hidden />
          Module Marketing
        </CardTitle>
        <CardDescription>
          Campagnes email/WhatsApp, relances automatiques et pages d&apos;atterrissage — module complémentaire à la
          carte, indépendant de votre forfait actuel (10 000 FCFA/mois).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button disabled={enCours} onClick={() => demarrer(() => activerAddon("MARKETING"))}>
          {enCours ? <Spinner /> : null}
          {enCours ? "Activation…" : "Activer le module Marketing"}
        </Button>
      </CardContent>
    </Card>
  );
}
