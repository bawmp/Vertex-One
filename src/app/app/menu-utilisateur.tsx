"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { LogOut, Languages, Sun, Moon, Monitor } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useTraduction } from "@/lib/i18n/contexte";
import type { Langue, Theme } from "@/lib/session";

// Correspondance entre les valeurs stockées en base (clair/sombre/systeme,
// utilisées aussi dans /app/mon-compte) et les noms internes de next-themes
// (light/dark/system) — jamais les mêmes noms, voir src/app/layout.tsx.
const THEME_VERS_NEXT_THEMES: Record<Theme, string> = { clair: "light", sombre: "dark", systeme: "system" };
const NEXT_THEMES_VERS_THEME: Record<string, Theme> = { light: "clair", dark: "sombre", system: "systeme" };
const CYCLE_THEME: Theme[] = ["clair", "sombre", "systeme"];

export function MenuUtilisateur({ nom, email, langue: langueInitiale }: { nom: string; email: string; langue?: Langue }) {
  const router = useRouter();
  const t = useTraduction();
  const { theme: themeActifNextThemes, setTheme } = useTheme();
  const [enCours, setEnCours] = useState(false);
  const [langue, setLangue] = useState<Langue>(langueInitiale ?? "fr");
  // next-themes ne connaît le thème réel (localStorage) qu'après le montage
  // côté client — themeActifNextThemes vaut undefined pendant le rendu
  // serveur ET le premier rendu client, avant de refléter la vraie valeur.
  // Sans ce garde-fou, l'icône rendue par le serveur (Monitor, faute de
  // savoir mieux) ne correspond pas à celle du client une fois le thème
  // résolu (ex. Moon) — erreur d'hydratation React réelle, constatée dans
  // les logs du serveur de dev. On force donc Monitor jusqu'au montage.
  const [monte, setMonte] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- patron standard next-themes pour éviter le mismatch d'hydratation (un seul re-rendu juste après le montage, jamais en cascade).
  useEffect(() => setMonte(true), []);

  async function deconnexion() {
    setEnCours(true);
    await authClient.signOut();
    router.push("/connexion");
    router.refresh();
  }

  // router.refresh() doit attendre la fin de updateUser() — un appel "fire
  // and forget" (void ...) suivi d'un refresh() synchrone re-affiche les
  // Server Components (sidebar, traduction) avant que l'écriture n'ait
  // atteint la base, donc avec l'ancienne langue : bug réel trouvé en
  // vérifiant en navigateur (le sélecteur affichait "EN" côté client — état
  // optimiste local — mais la sidebar restait en français malgré une
  // écriture déjà réussie en base).
  async function basculerLangue() {
    const nouvelle: Langue = langue === "fr" ? "en" : "fr";
    setLangue(nouvelle);
    await authClient.updateUser({ langue: nouvelle });
    router.refresh();
  }

  async function basculerTheme() {
    const themeActuel = NEXT_THEMES_VERS_THEME[themeActifNextThemes ?? "system"] ?? "systeme";
    const suivant = CYCLE_THEME[(CYCLE_THEME.indexOf(themeActuel) + 1) % CYCLE_THEME.length];
    setTheme(THEME_VERS_NEXT_THEMES[suivant]);
    await authClient.updateUser({ theme: suivant });
  }

  const IconeTheme = !monte ? Monitor : themeActifNextThemes === "dark" ? Moon : themeActifNextThemes === "light" ? Sun : Monitor;

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
