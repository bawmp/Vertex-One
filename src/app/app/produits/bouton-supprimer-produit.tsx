"use client";

import { useTransition } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { supprimerProduit } from "@/lib/actions/produit";

export function BoutonSupprimerProduit({ produitId }: { produitId: string }) {
  const [enCours, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      disabled={enCours}
      className="text-muted-foreground hover:text-destructive"
      aria-label="Supprimer le produit"
      onClick={() => {
        if (confirm("Supprimer ce produit ?")) startTransition(() => supprimerProduit(produitId));
      }}
    >
      {enCours ? <Spinner className="size-3.5" /> : <Trash2 className="size-4" aria-hidden />}
    </Button>
  );
}
