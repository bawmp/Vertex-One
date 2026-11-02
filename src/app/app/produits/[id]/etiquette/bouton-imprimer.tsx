"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export function BoutonImprimer({ libelle }: { libelle: string }) {
  return (
    <Button type="button" onClick={() => window.print()}>
      <Printer data-icon="inline-start" aria-hidden />
      {libelle}
    </Button>
  );
}
