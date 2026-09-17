"use client";

import { useTransition } from "react";
import { ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { activerAddon } from "@/lib/actions/addon";

export function BoutonActiverOneForm() {
  const [enCours, demarrer] = useTransition();

  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ClipboardList className="size-4" aria-hidden />
          Module One Form
        </CardTitle>
        <CardDescription>
          Créez des formulaires personnalisés et partagez-les via un lien public — module complémentaire à la carte,
          indépendant de votre forfait actuel (10 000 FCFA/mois).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button disabled={enCours} onClick={() => demarrer(() => activerAddon("ONE_FORM"))}>
          {enCours ? <Spinner /> : null}
          {enCours ? "Activation…" : "Activer le module One Form"}
        </Button>
      </CardContent>
    </Card>
  );
}
