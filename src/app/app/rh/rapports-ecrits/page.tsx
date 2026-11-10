import { redirect } from "next/navigation";
import Link from "next/link";
import { alias } from "drizzle-orm/pg-core";
import { and, desc, eq } from "drizzle-orm";
import { ArrowLeft, FileText, Lock } from "lucide-react";
import { avecEntreprise } from "@/db/client";
import { entreprise, rapportHierarchique, utilisateur } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { disponible } from "@/lib/plans";
import { destinatairesPossibles } from "@/lib/rh/rapport-hierarchique";
import { destinataireParDefaut } from "@/lib/rh/rapport-hierarchique-regles";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FormulaireRapport } from "./formulaire-rapport";
import { getT } from "@/lib/i18n/langue";

export default async function PageRapportsEcrits({ searchParams }: { searchParams: Promise<{ vue?: string }> }) {
  const t = await getT();
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte, "RH", "VOIR")) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Lock className="size-8 text-muted-foreground" aria-hidden />
        <p className="text-muted-foreground">{t("Vous n'avez pas accès aux Ressources Humaines.")}</p>
      </div>
    );
  }

  const { vue } = await searchParams;
  const vueEnvoyes = vue === "envoyes";

  const auteur = alias(utilisateur, "auteur");
  const destinataire = alias(utilisateur, "destinataire");

  const donnees = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [monEntreprise] = await tx
      .select({ planAbonnement: entreprise.planAbonnement, statutAbonnement: entreprise.statutAbonnement })
      .from(entreprise)
      .where(eq(entreprise.id, utilisateurConnecte.entrepriseId));
    if (!disponible(monEntreprise, "RH")) return null;

    // Seuls l'auteur et le destinataire lisent un rapport : le filtre porte sur l'utilisateur de la session, jamais sur une valeur du navigateur.
    const rapports = await tx
      .select({
        id: rapportHierarchique.id,
        objet: rapportHierarchique.objet,
        creeLe: rapportHierarchique.creeLe,
        luLe: rapportHierarchique.luLe,
        auteurNom: auteur.nomComplet,
        destinataireNom: destinataire.nomComplet,
      })
      .from(rapportHierarchique)
      .innerJoin(auteur, eq(rapportHierarchique.auteurId, auteur.id))
      .innerJoin(destinataire, eq(rapportHierarchique.destinataireId, destinataire.id))
      .where(
        and(
          eq(rapportHierarchique.entrepriseId, utilisateurConnecte.entrepriseId),
          vueEnvoyes ? eq(rapportHierarchique.auteurId, utilisateurConnecte.utilisateurId) : eq(rapportHierarchique.destinataireId, utilisateurConnecte.utilisateurId),
        ),
      )
      .orderBy(desc(rapportHierarchique.creeLe));

    const autorises = peut(utilisateurConnecte, "RH", "CREER") ? await destinatairesPossibles(tx, utilisateurConnecte) : [];
    const [moi] = await tx
      .select({ managerId: utilisateur.managerId })
      .from(utilisateur)
      .where(and(eq(utilisateur.id, utilisateurConnecte.utilisateurId), eq(utilisateur.entrepriseId, utilisateurConnecte.entrepriseId)));
    return { rapports, autorises, parDefaut: destinataireParDefaut(moi?.managerId ?? null, autorises) };
  });

  if (!donnees) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Lock className="size-8 text-muted-foreground" aria-hidden />
        <p className="text-muted-foreground">{t("Les Ressources Humaines sont disponibles à partir du forfait Business.")}</p>
      </div>
    );
  }

  const { rapports, autorises, parDefaut } = donnees;
  const peutEcrire = utilisateurConnecte.role === "EMPLOYE" || utilisateurConnecte.role === "MANAGER";

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <Link href="/app/rh" className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" aria-hidden />
        {t("Ressources Humaines")}
      </Link>

      <div className="flex items-center gap-2.5">
        <FileText className="size-5" aria-hidden />
        <h1 className="text-2xl font-semibold tracking-tight">{t("Rapports écrits")}</h1>
      </div>

      {peutEcrire ? <FormulaireRapport destinataires={autorises.map((p) => ({ id: p.id, nom: p.nomComplet, role: p.role as "ADMIN" | "MANAGER" }))} parDefaut={parDefaut} /> : null}

      <div className="flex gap-2 text-sm">
        <Link href="/app/rh/rapports-ecrits" className={`rounded-md px-3 py-1.5 ${!vueEnvoyes ? "bg-muted font-medium" : "text-muted-foreground hover:text-foreground"}`}>
          {t("Reçus")}
        </Link>
        <Link href="/app/rh/rapports-ecrits?vue=envoyes" className={`rounded-md px-3 py-1.5 ${vueEnvoyes ? "bg-muted font-medium" : "text-muted-foreground hover:text-foreground"}`}>
          {t("Envoyés")}
        </Link>
      </div>

      <Card className="p-0">
        <div className="flex flex-col divide-y divide-border">
          {rapports.map((r) => (
            <Link key={r.id} href={`/app/rh/rapports-ecrits/${r.id}`} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm hover:bg-muted/50">
              <div className="min-w-0">
                <p className={`truncate ${!vueEnvoyes && !r.luLe ? "font-semibold" : "font-medium"}`}>{r.objet}</p>
                <p className="text-xs text-muted-foreground">
                  {vueEnvoyes ? `${t("À")} ${r.destinataireNom}` : `${t("De")} ${r.auteurNom}`} — {new Intl.DateTimeFormat(t.locale, { dateStyle: "medium" }).format(r.creeLe)}
                </p>
              </div>
              {vueEnvoyes ? <Badge variant={r.luLe ? "success" : "neutral"}>{r.luLe ? t("Lu") : t("Non lu")}</Badge> : !r.luLe ? <Badge variant="warning">{t("Nouveau")}</Badge> : null}
            </Link>
          ))}
          {rapports.length === 0 ? <p className="px-4 py-6 text-center text-sm text-muted-foreground">{vueEnvoyes ? t("Aucun rapport envoyé pour le moment.") : t("Aucun rapport reçu pour le moment.")}</p> : null}
        </div>
      </Card>
    </div>
  );
}
