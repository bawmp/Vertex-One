"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { authClient } from "@/lib/auth-client";
import type { Langue, Theme } from "@/lib/session";

// Correspondance entre les valeurs stockées en base (clair/sombre/systeme,
// utilisées aussi dans /app/mon-compte) et les noms internes de next-themes
// (light/dark/system) — jamais les mêmes noms, voir src/app/layout.tsx.
const THEME_VERS_NEXT_THEMES: Record<Theme, string> = { clair: "light", sombre: "dark", systeme: "system" };
const NEXT_THEMES_VERS_THEME: Record<string, Theme> = { light: "clair", dark: "sombre", system: "systeme" };
const CYCLE_THEME: Theme[] = ["clair", "sombre", "systeme"];

/**
 * Actions du compte connecté (langue, thème, déconnexion), partagées par le menu
 * de la barre supérieure de l'application et celui de l'espace client — une seule
 * implémentation, pour ne jamais diverger.
 */
export function useActionsCompte(langueInitiale?: Langue) {
  const router = useRouter();
  const { theme: themeActifNextThemes, setTheme } = useTheme();
  const [enCours, setEnCours] = useState(false);
  const [langue, setLangue] = useState<Langue>(langueInitiale ?? "fr");
  // next-themes ne connaît le thème réel (localStorage) qu'après le montage
  // côté client — themeActifNextThemes vaut undefined pendant le rendu serveur
  // ET le premier rendu client. Sans ce garde-fou, l'icône rendue par le serveur
  // ne correspond pas à celle du client une fois le thème résolu : erreur
  // d'hydratation React réelle, constatée dans les logs du serveur de dev.
  const [monte, setMonte] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- patron standard next-themes pour éviter le mismatch d'hydratation (un seul re-rendu juste après le montage, jamais en cascade).
  useEffect(() => setMonte(true), []);

  async function deconnexion() {
    setEnCours(true);
    await authClient.signOut();
    router.push("/connexion");
    router.refresh();
  }

  // router.refresh() doit attendre la fin de updateUser() — un appel "fire and
  // forget" suivi d'un refresh() synchrone re-affiche les Server Components avant
  // que l'écriture n'ait atteint la base, donc avec l'ancienne langue (bug réel
  // trouvé en vérifiant en navigateur).
  async function basculerLangue() {
    const nouvelle: Langue = langue === "fr" ? "en" : "fr";
    setLangue(nouvelle);
    await authClient.updateUser({ langue: nouvelle });
    router.refresh();
  }

  const themeActuel: Theme = !monte ? "systeme" : (NEXT_THEMES_VERS_THEME[themeActifNextThemes ?? "system"] ?? "systeme");

  async function basculerTheme() {
    const suivant = CYCLE_THEME[(CYCLE_THEME.indexOf(themeActuel) + 1) % CYCLE_THEME.length];
    setTheme(THEME_VERS_NEXT_THEMES[suivant]);
    await authClient.updateUser({ theme: suivant });
  }

  return { enCours, langue, themeActuel, deconnexion, basculerLangue, basculerTheme };
}
