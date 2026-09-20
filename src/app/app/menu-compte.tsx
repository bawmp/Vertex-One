"use client";

import Link from "next/link";
import { ChevronDown, Languages, Lock, LogOut, Monitor, Moon, Sun, UserCog } from "lucide-react";
import { MenuDeroulant, SeparateurMenu, CLASSES_LIGNE_MENU } from "@/components/menu-deroulant";
import { Spinner } from "@/components/ui/spinner";
import { useTraduction } from "@/lib/i18n/contexte";
import type { Langue } from "@/lib/session";
import { useActionsCompte } from "./actions-compte";

function initialesDe(nom: string): string {
  return (
    nom
      .trim()
      .split(/\s+/)
      .map((mot) => mot[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?"
  );
}

/**
 * Menu du compte, dans la barre supérieure (coin droit) : profil, Mon compte,
 * Espace personnel (Administrateur), langue, thème et déconnexion. Le droit
 * d'accès à l'Espace personnel est décidé côté serveur (`afficherEspacePersonnel`)
 * ET revérifié par la page elle-même — jamais seulement par ce menu.
 */
export function MenuCompte({
  nom,
  email,
  role,
  langue: langueInitiale,
  afficherEspacePersonnel,
}: {
  nom: string;
  email: string;
  role: string;
  langue?: Langue;
  afficherEspacePersonnel: boolean;
}) {
  const t = useTraduction();
  const { enCours, langue, themeActuel, deconnexion, basculerLangue, basculerTheme } = useActionsCompte(langueInitiale);
  const IconeTheme = themeActuel === "sombre" ? Moon : themeActuel === "clair" ? Sun : Monitor;
  const libelleTheme = themeActuel === "sombre" ? t.monCompte.sombre : themeActuel === "clair" ? t.monCompte.clair : t.monCompte.systeme.split(" (")[0];
  const initiales = initialesDe(nom);

  return (
    <MenuDeroulant
      etiquette={t.menuUtilisateur.ouvrirMenuCompte}
      classesBouton="pl-1.5"
      declencheur={
        <>
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">{initiales}</span>
          <span className="hidden max-w-40 truncate sm:block">{nom}</span>
          <ChevronDown className="size-4 text-muted-foreground" aria-hidden />
        </>
      }
    >
      {(fermer) => (
        <>
          <div className="flex items-center gap-3 px-2.5 py-2.5">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">{initiales}</span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{nom}</p>
              <p className="truncate text-xs text-muted-foreground">{email}</p>
              <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-brand-gold-foreground/70">{role}</p>
            </div>
          </div>
          <SeparateurMenu />

          <Link href="/app/mon-compte" role="menuitem" onClick={fermer} className={CLASSES_LIGNE_MENU}>
            <UserCog className="size-4 text-muted-foreground" aria-hidden />
            {t.nav.monCompte}
          </Link>
          {afficherEspacePersonnel ? (
            <Link href="/app/mon-espace" role="menuitem" onClick={fermer} className={CLASSES_LIGNE_MENU}>
              <Lock className="size-4 text-muted-foreground" aria-hidden />
              {t.nav.monEspace}
            </Link>
          ) : null}

          <SeparateurMenu />
          <button type="button" role="menuitem" onClick={basculerLangue} className={CLASSES_LIGNE_MENU}>
            <Languages className="size-4 text-muted-foreground" aria-hidden />
            <span className="flex-1">{t.monCompte.langue}</span>
            <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs font-semibold">{langue.toUpperCase()}</span>
          </button>
          <button type="button" role="menuitem" onClick={basculerTheme} className={CLASSES_LIGNE_MENU}>
            <IconeTheme className="size-4 text-muted-foreground" aria-hidden />
            <span className="flex-1">{t.monCompte.theme}</span>
            <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs font-semibold">{libelleTheme}</span>
          </button>

          <SeparateurMenu />
          <button type="button" role="menuitem" onClick={deconnexion} disabled={enCours} className={`${CLASSES_LIGNE_MENU} text-destructive hover:bg-destructive/10 focus-visible:bg-destructive/10`}>
            {enCours ? <Spinner className="size-4" /> : <LogOut className="size-4" aria-hidden />}
            {t.menuUtilisateur.deconnexion}
          </button>
        </>
      )}
    </MenuDeroulant>
  );
}
