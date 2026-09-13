"use client";

import { useTransition } from "react";
import { CalendarCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { activerAddon } from "@/lib/actions/addon";

export function BoutonActiverReservations() {
  const [enCours, demarrer] = useTransition();

  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarCheck className="size-4" aria-hidden />
          Module Réservations
        </CardTitle>
        <CardDescription>
          Une page publique où vos clients réservent un créneau seuls, sans compte — module complémentaire à la carte,
          indépendant de votre forfait actuel (10 000 FCFA/mois).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button disabled={enCours} onClick={() => demarrer(() => activerAddon("RESERVATIONS"))}>
          {enCours ? <Spinner /> : null}
          {enCours ? "Activation…" : "Activer le module Réservations"}
        </Button>
      </CardContent>
    </Card>
  );
}
