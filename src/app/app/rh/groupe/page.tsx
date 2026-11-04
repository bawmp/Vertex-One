import { m } from "@/lib/i18n/catalogue";
import { redirect } from "next/navigation";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { ArrowLeft, Building2, CalendarDays, Cake, Check, Lock, Network, Phone, ShieldCheck, Users } from "lucide-react";
import { avecEntreprise } from "@/db/client";
import { entreprise } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { disponible } from "@/lib/plans";
import { Badge } from "@/components/ui/badge";
import { EtatVide } from "@/components/etat-vide";
import { AvatarCollaborateur } from "@/components/avatar-collaborateur";
import { CarteFiche } from "@/components/fiche/fiche-ui";
import { collaborateursDesPartenaires, etatPartageFiches, peutVoirFichesPartagees } from "@/lib/rh/groupe-fiches";
import { adressePhoto } from "@/lib/rh/photo-affichage";
import { LIBELLE_CONTRAT, LIBELLE_ROLE } from "@/lib/rh/fiche-affichage";
import { libelleDelai, prochainAnniversaire } from "@/lib/rh/anniversaires-regles";
import { ReglagePartage } from "./reglage-partage";
import { getT } from "@/lib/i18n/langue";

export const dynamic = "force-dynamic";

const PARTAGE = [m("Nom et photo"), m("Rôle, poste et type de contrat"), m("Date d'arrivée et département"), m("Téléphone"), m("Date de naissance (rappel des anniversaires)")];
const JAMAIS = [m("Le salaire"), m("L'adresse et la personne à prévenir"), m("Les fichiers RH"), m("Les congés et les évaluations"), m("Les tâches")];

/**
 * Équipes du groupe : les collaborateurs des autres entreprises du groupe, en lecture seule, et le réglage du partage (Administrateur). Les deux
 * entreprises doivent avoir activé le partage ; seule une liste blanche de champs est lue (jamais le salaire).
 */
export default async function PageEquipesDuGroupe() {
  const t = await getT();
  const u = await recupererUtilisateurConnecte();
  if (!u) redirect("/connexion");
  const admin = u.role === "ADMIN" && peut(u, "RH", "MODIFIER");
  if (!admin && !peutVoirFichesPartagees(u)) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Lock className="size-8 text-muted-foreground" aria-hidden />
        <p className="text-muted-foreground">{t("Cette page est réservée à l'Administrateur et aux Managers.")}</p>
      </div>
    );
  }
  const rhOk = await avecEntreprise(u.entrepriseId, async (tx) => {
    const [e] = await tx.select({ planAbonnement: entreprise.planAbonnement, statutAbonnement: entreprise.statutAbonnement }).from(entreprise).where(eq(entreprise.id, u.entrepriseId));
    return Boolean(e) && disponible(e, "RH");
  });
  if (!rhOk) redirect("/app/rh");

  const etat = await etatPartageFiches(u.entrepriseId);
  const gens = await collaborateursDesPartenaires(u);
  const parEntreprise = new Map<string, { nom: string; gens: typeof gens }>();
  for (const g of gens) {
    const e = parEntreprise.get(g.entrepriseId) ?? { nom: g.entrepriseNom, gens: [] };
    e.gens.push(g);
    parEntreprise.set(g.entrepriseId, e);
  }
  const aujourdhui = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Douala" }).format(new Date());
  const jourFr = (d: Date) => new Intl.DateTimeFormat(t.locale, { dateStyle: "medium", timeZone: "UTC" }).format(d);

  return (
    <div className="flex max-w-6xl flex-col gap-6">
      <Link href="/app/rh" className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" aria-hidden />
        {t("Retour")}
      </Link>

      <div className="flex items-center gap-2.5">
        <Network className="size-5" aria-hidden />
        <h1 className="text-2xl font-semibold tracking-tight">{t("Équipes du groupe")}</h1>
      </div>
      <p className="text-sm text-muted-foreground">{t("Les collaborateurs des autres entreprises de votre groupe, en lecture seule. Le partage n'a lieu que si les deux entreprises l'ont activé.")}</p>

      <div className="grid gap-6 lg:grid-cols-2">
        <CarteFiche icone={ShieldCheck} titre={t("Ce qui est partagé")} aide={t("Liste fermée, en lecture seule")} ton="vert">
          <ul className="grid gap-1.5 text-sm">
            {PARTAGE.map((t) => (
              <li key={t} className="flex items-center gap-2">
                <Check className="size-4 text-emerald-600" aria-hidden />
                {t}
              </li>
            ))}
          </ul>
          <div className="mt-1 rounded-xl bg-marque-orange-50 px-4 py-3 dark:bg-marque-orange-900/20">
            <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold">
              <Lock className="size-3.5 text-marque-orange-600" aria-hidden />
              {t("Jamais partagé, même avec l'Administrateur d'une autre entreprise")}
            </p>
            <ul className="grid gap-0.5 text-xs text-muted-foreground">
              {JAMAIS.map((t) => (
                <li key={t}>· {t}</li>
              ))}
            </ul>
          </div>
        </CarteFiche>

        <CarteFiche icone={Building2} titre={t("Votre groupe")} aide={etat.groupe ? `${etat.autres.length} autre(s) entreprise(s)` : t("Votre entreprise n'appartient à aucun groupe")} ton="bleu">
          {!etat.groupe ? (
            <p className="text-sm text-muted-foreground">
              {t("Créez un groupe ou rattachez votre entreprise à un groupe existant dans")}{" "}
              <Link href="/app/parametres/entreprise" className="font-medium text-primary underline-offset-4 hover:underline">
                {t("Paramètres → Entreprise")}
              </Link>
              .
            </p>
          ) : (
            <>
              {admin ? <ReglagePartage actif={etat.partageActif} /> : <p className="text-sm text-muted-foreground">{etat.partageActif ? t("Votre entreprise partage ses fiches avec le groupe.") : t("Votre entreprise ne partage pas encore ses fiches : seul l'Administrateur peut l'activer.")}</p>}
              {etat.autres.length === 0 ? <p className="text-sm text-muted-foreground">{t("Aucune autre entreprise dans votre groupe pour le moment.")}</p> : null}
              <ul className="flex flex-col divide-y divide-border/60">
                {etat.autres.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <span className="font-medium">{a.nom}</span>
                    {a.partageActif ? <Badge variant="success">{t("Partage activé")}</Badge> : <Badge variant="warning">{t("N'a pas activé le partage")}</Badge>}
                  </li>
                ))}
              </ul>
            </>
          )}
        </CarteFiche>
      </div>

      {parEntreprise.size === 0 ? (
        <EtatVide icone={Users} titre={t("Aucune fiche partagée pour le moment.")} description={etat.groupe ? (etat.partageActif ? t("Les fiches d'une autre entreprise apparaissent ici dès qu'elle active aussi le partage.") : t("Activez le partage ci-dessus ; les fiches apparaissent dès que l'autre entreprise l'active aussi.")) : t("Rattachez votre entreprise à un groupe pour partager vos fiches.")} />
      ) : (
        [...parEntreprise.entries()].map(([id, e]) => (
          <section key={id} className="flex flex-col gap-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Building2 className="size-4 text-muted-foreground" aria-hidden />
              {e.nom}
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">{e.gens.length}</span>
            </h2>
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {e.gens.map((g) => {
                const anniv = g.dateNaissance ? prochainAnniversaire(g.dateNaissance, aujourdhui) : null;
                return (
                  <li key={g.utilisateurId} className="overflow-hidden rounded-2xl bg-card ring-1 ring-foreground/[0.06] shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_-12px_rgba(0,0,0,0.12)]">
                    <div className="relative h-14 overflow-hidden bg-linear-to-br from-marque-bleu-800 via-marque-bleu-700 to-marque-bleu-500">
                      <div aria-hidden className="absolute -top-8 -right-6 size-28 rounded-full bg-marque-orange/40 blur-2xl" />
                      <div aria-hidden className="absolute inset-0 opacity-60 [background-image:radial-gradient(color-mix(in_oklab,white_18%,transparent)_1px,transparent_1px)] [background-size:14px_14px]" />
                      {anniv && anniv.jours <= 7 ? (
                        <span className="absolute top-2 right-2 flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-semibold text-white ring-1 ring-white/30 backdrop-blur-md">
                          <Cake className="size-3" aria-hidden />
                          {anniv.jours === 0 ? t("Aujourd'hui") : libelleDelai(anniv.jours, t)}
                        </span>
                      ) : null}
                    </div>
                    <div className="flex flex-col items-center gap-1 px-4 pt-0 pb-4 text-center">
                      <div className="relative z-10 -mt-8">
                        <AvatarCollaborateur nom={g.nom} adresse={adressePhoto("utilisateur", g.utilisateurId, g.photoCle)} taille="carte" version={g.photoCle ?? ""} />
                      </div>
                      <p className="mt-1 text-sm font-semibold">{g.nom}</p>
                      <p className="text-xs text-muted-foreground">{g.poste}</p>
                      <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5">
                        <Badge variant="brand">{t(LIBELLE_ROLE[g.role] ?? g.role)}</Badge>
                        <Badge variant="neutral">{t(LIBELLE_CONTRAT[g.typeContrat] ?? g.typeContrat)}</Badge>
                      </div>
                      <ul className="mt-3 flex w-full flex-col gap-1 border-t pt-3 text-left text-xs text-muted-foreground">
                        <li className="flex items-center gap-2">
                          <CalendarDays className="size-3.5 shrink-0" aria-hidden />
                          {t("Arrivé(e) le {date}", { date: jourFr(g.dateEmbauche) })}
                        </li>
                        {g.departement ? (
                          <li className="flex items-center gap-2">
                            <Building2 className="size-3.5 shrink-0" aria-hidden />
                            {g.departement}
                          </li>
                        ) : null}
                        {g.telephone ? (
                          <li className="flex items-center gap-2">
                            <Phone className="size-3.5 shrink-0" aria-hidden />
                            {g.telephone}
                          </li>
                        ) : null}
                      </ul>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
