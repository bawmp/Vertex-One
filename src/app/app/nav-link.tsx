"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export function NavLink({
  href,
  children,
  className,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  const pathname = usePathname();
  const actif = pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      prefetch={false}
      className={cn(
        "group relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors duration-150",
        actif
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground",
        className
      )}
    >
      <span
        aria-hidden
        className={cn(
          "absolute inset-y-1 left-0 w-1 rounded-full bg-primary transition-transform duration-200",
          actif ? "scale-y-100" : "scale-y-0"
        )}
      />
      {children}
    </Link>
  );
}

type LienSousMenu = { href: string; libelle: string; icone: React.ReactNode };
type GroupeSousMenu = { categorie?: string; liens: LienSousMenu[] };

// Un module qui se subdivise en plusieurs entités (CRM → Leads/Contacts/
// Comptes/Deals, comme les onglets d'un même module dans Zoho) reste UNE
// entrée de sidebar avec une liste déroulante — jamais éclaté en plusieurs
// items racine, qui rendrait la navigation touffue (retour utilisateur,
// 2026-09-06). Les entités sont elles-mêmes regroupées par catégorie (ex.
// « Ventes ») comme dans la vraie arborescence Zoho CRM — même si une seule
// catégorie existe pour l'instant, la structure est prête pour en accueillir
// d'autres (Activités, etc.) sans nouveau remaniement. Le libellé du module
// navigue lui-même vers son Accueil (hrefAccueil, ex. /app/crm, comme le clic
// sur l'app CRM chez Zoho ouvre son tableau de bord) pendant que le chevron,
// cible séparée, ne fait que déplier/replier la liste.
export function NavGroup({
  libelle,
  icone,
  groupes,
  hrefAccueil,
}: {
  libelle: string;
  // Une référence de composant (fonction) ne peut pas traverser la frontière
  // Server → Client Component (RSC) — layout.tsx est un Server Component,
  // donc l'icône est déjà rendue en JSX côté serveur avant d'être passée ici
  // (erreur réelle rencontrée : "Only plain objects can be passed to Client
  // Components from Server Components").
  icone: React.ReactNode;
  groupes: GroupeSousMenu[];
  hrefAccueil?: string;
}) {
  const pathname = usePathname();
  const tousLesLiens = groupes.flatMap((groupe) => groupe.liens);
  const surAccueil = hrefAccueil != null && pathname === hrefAccueil;
  const contientPageActive = surAccueil || tousLesLiens.some((lien) => pathname === lien.href || pathname.startsWith(`${lien.href}/`));
  const [ouvertManuel, setOuvertManuel] = useState<boolean | null>(null);
  const ouvert = ouvertManuel ?? contientPageActive;

  const classeLigne = cn(
    "group relative flex flex-1 items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors duration-150",
    contientPageActive
      ? "bg-sidebar-accent text-sidebar-accent-foreground"
      : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
  );
  const barreActive = (
    <span
      aria-hidden
      className={cn(
        "absolute inset-y-1 left-0 w-1 rounded-full bg-primary transition-transform duration-200",
        contientPageActive ? "scale-y-100" : "scale-y-0"
      )}
    />
  );

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-0.5">
        {hrefAccueil ? (
          <Link href={hrefAccueil} prefetch={false} className={classeLigne}>
            {barreActive}
            {icone}
            <span className="flex-1 text-left">{libelle}</span>
          </Link>
        ) : (
          <button type="button" onClick={() => setOuvertManuel(!ouvert)} aria-expanded={ouvert} className={classeLigne}>
            {barreActive}
            {icone}
            <span className="flex-1 text-left">{libelle}</span>
          </button>
        )}
        <button
          type="button"
          onClick={() => setOuvertManuel(!ouvert)}
          aria-expanded={ouvert}
          aria-label={ouvert ? `Replier ${libelle}` : `Déplier ${libelle}`}
          className="flex shrink-0 items-center justify-center rounded-lg p-2 text-sidebar-foreground/50 transition-colors hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
        >
          <ChevronDown className={cn("size-3.5 shrink-0 transition-transform duration-200", ouvert ? "rotate-180" : "")} aria-hidden />
        </button>
      </div>
      {ouvert ? (
        <div className="flex flex-col gap-2 py-0.5 pl-4">
          {groupes.map((groupe, index) => (
            <div key={groupe.categorie ?? index} className="flex flex-col gap-0.5">
              {groupe.categorie ? (
                <p className="px-2.5 pt-1 text-[11px] font-medium uppercase tracking-wide text-sidebar-foreground/40">
                  {groupe.categorie}
                </p>
              ) : null}
              {groupe.liens.map((lien) => (
                <NavLink key={lien.href} href={lien.href} className="py-1.5 text-[13px]">
                  {lien.icone}
                  {lien.libelle}
                </NavLink>
              ))}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
