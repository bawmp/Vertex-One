import { redirect } from "next/navigation";
import Link from "next/link";
import { ShieldCheck, LayoutDashboard, Building2, ArrowLeft } from "lucide-react";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { estStaffPlateforme } from "@/lib/plateforme/acces";

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
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950">
      <header className="sticky top-0 z-10 border-b border-stone-800 bg-stone-950 text-stone-100">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-2.5 text-sm font-semibold tracking-wide">
            <ShieldCheck className="size-4 text-emerald-400" aria-hidden />
            VERTEX ONE <span className="font-normal text-stone-400">— Console interne</span>
          </div>
          <nav className="flex items-center gap-5 text-sm text-stone-300">
            <Link href="/plateforme" className="flex items-center gap-1.5 hover:text-white">
              <LayoutDashboard className="size-3.5" aria-hidden />
              Tableau de bord
            </Link>
            <Link href="/plateforme/entreprises" className="flex items-center gap-1.5 hover:text-white">
              <Building2 className="size-3.5" aria-hidden />
              Entreprises
            </Link>
            <Link href="/app" className="flex items-center gap-1.5 text-stone-500 hover:text-stone-200">
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
