"use client";

import { LogOut, Languages, Sun, Moon, Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useTraduction } from "@/lib/i18n/contexte";
import type { Langue } from "@/lib/session";
import { useActionsCompte } from "./actions-compte";

/**
 * Bloc compte de l'espace client (portail) : nom, email, déconnexion, langue et
 * thème. Dans l'application, ces actions sont dans le menu de la barre
 * supérieure (menu-compte.tsx) ; la logique est partagée (actions-compte.ts).
 */
export function MenuUtilisateur({ nom, email, langue: langueInitiale }: { nom: string; email: string; langue?: Langue }) {
  const t = useTraduction();
  const { enCours, langue, themeActuel, deconnexion, basculerLangue, basculerTheme } = useActionsCompte(langueInitiale);
  const IconeTheme = themeActuel === "sombre" ? Moon : themeActuel === "clair" ? Sun : Monitor;

  const initiales =
    nom
      .trim()
      .split(/\s+/)
      .map((mot) => mot[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?";

  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-sidebar-border bg-sidebar-accent/30 p-2.5">
      <div className="flex items-center gap-2.5">
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
          aria-label={t.menuUtilisateur.deconnexion}
          className="shrink-0 text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-destructive"
        >
          {enCours ? <Spinner /> : <LogOut className="size-4" aria-hidden />}
        </Button>
      </div>
      <div className="flex items-center gap-1 border-t border-sidebar-border pt-1.5">
        <Button
          variant="ghost"
          size="sm"
          onClick={basculerLangue}
          aria-label={langue === "fr" ? t.monCompte.francais : t.monCompte.anglais}
          className="h-7 gap-1.5 px-2 text-xs text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground"
        >
          <Languages className="size-3.5 shrink-0" aria-hidden />
          {langue.toUpperCase()}
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={basculerTheme}
          aria-label={t.monCompte.theme}
          className="shrink-0 text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground"
        >
          <IconeTheme className="size-3.5" aria-hidden />
        </Button>
      </div>
    </div>
  );
}
