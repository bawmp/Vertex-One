"use client";

import { useTransition } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { supprimerDisponibilite } from "@/lib/actions/reservations";

export function BoutonSupprimerDisponibilite({ disponibiliteId }: { disponibiliteId: string }) {
  const [enCours, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="ghost"
      size="xs"
      disabled={enCours}
      className="text-muted-foreground hover:text-destructive"
      onClick={() => startTransition(() => supprimerDisponibilite(disponibiliteId))}
    >
      {enCours ? <Spinner className="size-3.5" /> : <X className="size-3.5" aria-hidden />}
    </Button>
  );
}
