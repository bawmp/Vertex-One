"use client";

import Link from "next/link";
import { Settings } from "lucide-react";
import { MenuDeroulant, SeparateurMenu, CLASSES_LIGNE_MENU } from "@/components/menu-deroulant";
import { useTraduction } from "@/lib/i18n/contexte";

/**
 * Accès aux paramètres de l'entreprise, dans la barre supérieure. La liste des
 * liens est déjà filtrée côté serveur selon le rôle ; chaque page reste
 * protégée par sa propre vérification de droits.
 */
export function MenuParametres({ liens }: { liens: { href: string; libelle: string; icone: React.ReactNode }[] }) {
  const t = useTraduction();

  return (
    <MenuDeroulant
      etiquette={t.menuUtilisateur.ouvrirMenuParametres}
      declencheur={
        <>
          <Settings className="size-4.5 text-muted-foreground" aria-hidden />
          <span className="hidden lg:block">{t.nav.parametres}</span>
        </>
      }
    >
      {(fermer) => (
        <>
          <Link href="/app/parametres" role="menuitem" onClick={fermer} className={`${CLASSES_LIGNE_MENU} font-semibold`}>
            <Settings className="size-4 text-muted-foreground" aria-hidden />
            {t.menuUtilisateur.tousLesParametres}
          </Link>
          <SeparateurMenu />
          {liens.map((lien) => (
            <Link key={lien.href} href={lien.href} role="menuitem" onClick={fermer} className={CLASSES_LIGNE_MENU}>
              <span className="text-muted-foreground">{lien.icone}</span>
              {lien.libelle}
            </Link>
          ))}
        </>
      )}
    </MenuDeroulant>
  );
}
