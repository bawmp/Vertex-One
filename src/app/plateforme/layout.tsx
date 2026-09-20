import { redirect } from "next/navigation";
import Link from "next/link";
import { ShieldCheck, LayoutDashboard, Building2, ArrowLeft } from "lucide-react";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { estStaffPlateforme } from "@/lib/plateforme/acces";
import { LogoEntreprise } from "@/components/logo-entreprise";

/**
 * Console interne plateforme (2026-09-14) — première zone du produit à voir
 * des données à travers plusieurs entreprises. Garde d'accès ici (staff
 * uniquement, voir src/lib/plateforme/acces.ts) + un habillage
 * volontairement distinct de la sidebar tenant (/app/app/layout.tsx), pour
 * qu'on sache toujours sans ambiguïté dans quel "mode" on se trouve.
 */
export default async function LayoutPlateforme({ children }: { children: React.ReactNode }) {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!(await estStaffPlateforme())) redirect("/app");

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b-2 border-b-marque-orange bg-sidebar text-sidebar-foreground">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-4">
            <LogoEntreprise taille="bandeau" className="h-14" />
            <span className="flex items-center gap-2 text-sm font-semibold tracking-wide">
              <ShieldCheck className="size-4 text-marque-orange" aria-hidden />
              Console interne
            </span>
          </div>
          <nav className="flex items-center gap-5 text-sm text-sidebar-foreground/85">
            <Link href="/plateforme" className="flex items-center gap-1.5 hover:text-white">
              <LayoutDashboard className="size-3.5" aria-hidden />
              Tableau de bord
            </Link>
            <Link href="/plateforme/entreprises" className="flex items-center gap-1.5 hover:text-white">
              <Building2 className="size-3.5" aria-hidden />
              Entreprises
            </Link>
            <Link href="/app" className="flex items-center gap-1.5 text-sidebar-foreground/60 hover:text-white">
              <ArrowLeft className="size-3.5" aria-hidden />
              Retour à l&apos;application
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
