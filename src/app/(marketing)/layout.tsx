import Link from "next/link";
import { Wordmark } from "@/components/wordmark";
import { EnTeteMarketing } from "./en-tete";
import { KyriaChat } from "./kyria/kyria-chat";

const LIENS_PIED = [
  { href: "/modules", libelle: "Modules" },
  { href: "/tarifs", libelle: "Tarifs" },
  { href: "/a-propos", libelle: "À propos" },
  { href: "/contact", libelle: "Contact" },
];

/**
 * Habillage du site vitrine (2026-09-14) — distinct de la sidebar tenant
 * (/app) et de l'en-tête sombre de la Console interne (/plateforme), pensé
 * pour un visiteur qui ne connaît pas encore le produit. Reprend le dégradé
 * bleu marine de la charte, utilisé par les autres pages publiques
 * (/reserver, /p/[slug], src/app/(auth)/layout.tsx) pour la cohérence de
 * marque, sans dupliquer leur code (usage ponctuel, pas partagé).
 */
export default function LayoutMarketing({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <EnTeteMarketing />
      <main className="flex-1">{children}</main>
      <footer className="border-t border-border bg-muted/30">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-10 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col gap-2">
            <Wordmark slogan className="h-24" />
            <p className="max-w-xs text-sm text-muted-foreground">
              La suite de gestion pensée pour les entreprises de services au Cameroun.
            </p>
          </div>
          <nav className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
            {LIENS_PIED.map((lien) => (
              <Link key={lien.href} href={lien.href} className="hover:text-foreground">
                {lien.libelle}
              </Link>
            ))}
          </nav>
        </div>
        <div className="border-t border-border px-6 py-4 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} Vertex One — Fait au Cameroun.
        </div>
      </footer>
      <KyriaChat />
    </div>
  );
}
