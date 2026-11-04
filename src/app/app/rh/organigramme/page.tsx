import { redirect } from "next/navigation";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { ArrowLeft, Building2, Lock, Network } from "lucide-react";
import { avecEntreprise } from "@/db/client";
import { entreprise } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { disponible } from "@/lib/plans";
import { Badge } from "@/components/ui/badge";
import { EtatVide } from "@/components/etat-vide";
import { AvatarCollaborateur } from "@/components/avatar-collaborateur";
import { compterPersonnes, lireOrganigramme, type NoeudOrganigramme } from "@/lib/rh/organigramme";
import { adressePhoto } from "@/lib/rh/photo-affichage";
import { LIBELLE_ROLE } from "@/lib/rh/fiche-affichage";
import { getT } from "@/lib/i18n/langue";
import type { Traducteur } from "@/lib/i18n/catalogue";

export const dynamic = "force-dynamic";

function Noeud({ n, t, enfant = false }: { n: NoeudOrganigramme; t: Traducteur; enfant?: boolean }) {
  const equipe = compterPersonnes(n.enfants);
  return (
    <li className={enfant ? "relative before:absolute before:top-6 before:-left-5 before:h-0.5 before:w-5 before:bg-marque-bleu-200 sm:before:-left-6 sm:before:w-6 dark:before:bg-marque-bleu-800" : ""}>
      <Link href={`/app/rh/${n.dossierId}`} className="survol-elevation flex min-w-0 items-center gap-3 rounded-2xl bg-card p-3 ring-1 ring-foreground/[0.06] shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_-12px_rgba(0,0,0,0.1)]">
        <AvatarCollaborateur nom={n.nom} adresse={adressePhoto("utilisateur", n.id, n.photoCle)} taille="moyen" version={n.photoCle ?? ""} />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">{n.nom}</span>
          <span className="block text-xs text-muted-foreground">{n.poste}</span>
          {n.departement ? (
            <span className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
              <Building2 className="size-3 shrink-0" aria-hidden />
              {n.departement}
            </span>
          ) : null}
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1">
          <Badge variant="brand">{t(LIBELLE_ROLE[n.role] ?? n.role)}</Badge>
          {equipe > 0 ? <span className="text-[10px] font-medium text-muted-foreground">{t("{n} dans l'équipe", { n: equipe })}</span> : null}
        </span>
      </Link>
      {n.enfants.length > 0 ? (
        <ul className="mt-2 ml-5 flex flex-col gap-2 border-l-2 border-marque-bleu-200 pl-5 sm:ml-8 sm:pl-6 dark:border-marque-bleu-800">
          {n.enfants.map((e) => (
            <Noeud key={e.id} n={e} t={t} enfant />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

/** Organigramme : la hiérarchie de l'entreprise d'après le responsable de chacun. Administrateur : tout ; Manager : son équipe. Jamais de salaire. */
export default async function PageOrganigramme() {
  const t = await getT();
  const u = await recupererUtilisateurConnecte();
  if (!u) redirect("/connexion");
  if ((u.role !== "ADMIN" && u.role !== "MANAGER") || !peut(u, "RH", "VOIR")) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Lock className="size-8 text-muted-foreground" aria-hidden />
        <p className="text-muted-foreground">{t("Cette page est réservée à l'Administrateur et aux Managers.")}</p>
      </div>
    );
  }
  const donnees = await avecEntreprise(u.entrepriseId, async (tx) => {
    const [e] = await tx.select({ planAbonnement: entreprise.planAbonnement, statutAbonnement: entreprise.statutAbonnement }).from(entreprise).where(eq(entreprise.id, u.entrepriseId));
    if (!e || !disponible(e, "RH")) return null;
    return lireOrganigramme(tx, u);
  });
  if (!donnees) redirect("/app/rh");
  const total = compterPersonnes(donnees);

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <Link href="/app/rh" className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" aria-hidden />
        {t("Retour")}
      </Link>
      <div className="flex items-center gap-2.5">
        <Network className="size-5" aria-hidden />
        <h1 className="text-2xl font-semibold tracking-tight">{t("Organigramme")}</h1>
        <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">{total}</span>
      </div>
      <p className="text-sm text-muted-foreground">{t("La hiérarchie d'après le responsable de chaque personne. Le responsable se choisit sur la fiche (Poste et contrat). Cliquez sur une personne pour ouvrir sa fiche.")}</p>
      {donnees.length === 0 ? (
        <EtatVide icone={Network} titre={t("Aucune personne à afficher.")} description={t("Les collaborateurs actifs apparaissent ici dès qu'ils ont une fiche.")} />
      ) : (
        <ul className="flex flex-col gap-3">
          {donnees.map((n) => (
            <Noeud key={n.id} n={n} t={t} />
          ))}
        </ul>
      )}
    </div>
  );
}
