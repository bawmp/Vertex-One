"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { Wordmark } from "@/components/wordmark";
import { Button } from "@/components/ui/button";

const LIENS_NAV = [
  { href: "/modules", libelle: "Modules" },
  { href: "/tarifs", libelle: "Tarifs" },
  { href: "/a-propos", libelle: "À propos" },
  { href: "/contact", libelle: "Contact" },
];

/**
 * Composant client uniquement pour le menu mobile (pas de nouvelle
 * dépendance type Sheet — un simple useState suffit, voir le plan). Le
 * reste de l'en-tête pourrait être un Server Component, mais le séparer
 * n'apporterait rien ici pour une poignée de liens.
 */
export function EnTeteMarketing() {
  const [ouvert, setOuvert] = useState(false);

  return (
    <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-2">
        <Link href="/">
          <Wordmark className="h-12" />
        </Link>

        <nav className="hidden items-center gap-6 text-sm font-medium text-muted-foreground md:flex">
          {LIENS_NAV.map((lien) => (
            <Link key={lien.href} href={lien.href} className="hover:text-foreground">
              {lien.libelle}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <Button variant="ghost" render={<Link href="/connexion" />} nativeButton={false}>
            Se connecter
          </Button>
          <Button render={<Link href="/inscription" />} nativeButton={false}>
            Essai gratuit
          </Button>
        </div>

        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          aria-label={ouvert ? "Fermer le menu" : "Ouvrir le menu"}
          onClick={() => setOuvert((v) => !v)}
        >
          {ouvert ? <X aria-hidden /> : <Menu aria-hidden />}
        </Button>
      </div>

      {ouvert ? (
        <nav className="flex flex-col gap-1 border-t border-border px-6 py-4 md:hidden">
          {LIENS_NAV.map((lien) => (
            <Link
              key={lien.href}
              href={lien.href}
              className="rounded-md px-2 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={() => setOuvert(false)}
            >
              {lien.libelle}
            </Link>
          ))}
          <div className="mt-2 flex flex-col gap-2 border-t border-border pt-3">
            <Button variant="outline" render={<Link href="/connexion" />} nativeButton={false}>
              Se connecter
            </Button>
            <Button render={<Link href="/inscription" />} nativeButton={false}>
              Essai gratuit
            </Button>
          </div>
        </nav>
      ) : null}
    </header>
  );
}
