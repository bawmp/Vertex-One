"use client";

import { useTransition } from "react";
import { Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { genererFactureDepuisHeures } from "@/lib/actions/entree-temps";

export function BoutonGenererFactureHeures({ projetId }: { projetId: string }) {
  const [enCours, startTransition] = useTransition();

  return (
    <Button type="button" size="sm" variant="outline" disabled={enCours} onClick={() => startTransition(() => genererFactureDepuisHeures(projetId))}>
      {enCours ? <Spinner /> : <Receipt data-icon="inline-start" aria-hidden />}
      {enCours ? "Génération…" : "Générer une facture"}
    </Button>
  );
}
