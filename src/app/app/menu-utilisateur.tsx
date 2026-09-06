"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

export function MenuUtilisateur({ nom, email }: { nom: string; email: string }) {
  const router = useRouter();
  const [enCours, setEnCours] = useState(false);

  async function deconnexion() {
    setEnCours(true);
    await authClient.signOut();
    router.push("/connexion");
    router.refresh();
  }

  const initiales =
    nom
      .trim()
      .split(/\s+/)
      .map((mot) => mot[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?";

  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-sidebar-border bg-sidebar-accent/30 p-2.5">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
        {initiales}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-sidebar-foreground">{nom}</p>
        <p className="truncate text-xs text-sidebar-foreground/60">{email}</p>
      </div>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={deconnexion}
        disabled={enCours}
        aria-label="Se déconnecter"
        className="shrink-0 text-sidebar-foreground/60 hover:text-destructive"
      >
        {enCours ? <Spinner /> : <LogOut className="size-4" aria-hidden />}
      </Button>
    </div>
  );
}
