"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { activerAddon, desactiverAddon } from "@/lib/actions/addon";
import type { Addon } from "@/lib/plans";

export function BoutonToggleAddon({ addon, actif }: { addon: Addon; actif: boolean }) {
  const [enCours, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant={actif ? "outline" : "default"}
      size="sm"
      disabled={enCours}
      onClick={() => startTransition(() => (actif ? desactiverAddon(addon) : activerAddon(addon)))}
    >
      {enCours ? <Spinner className="size-3.5" /> : null}
      {actif ? "Désactiver" : "Activer"}
    </Button>
  );
}
