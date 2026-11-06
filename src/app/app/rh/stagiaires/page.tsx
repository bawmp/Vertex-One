import { redirect } from "next/navigation";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { ArrowLeft, GraduationCap, Lock, Plus } from "lucide-react";
import { avecEntreprise } from "@/db/client";
import { entreprise } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { disponible } from "@/lib/plans";
import { etatStage, joursRestants, listerStagiairesAcademiques, listerStagiairesPro } from "@/lib/rh/stage";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getT } from "@/lib/i18n/langue";
import { m } from "@/lib/i18n/catalogue";

export const dynamic = "force-dynamic";


async function BadgeEtat({ etat, jours }: { etat: ReturnType<typeof etatStage>; jours: number | null }) {
  const t = await getT();
  if (etat === "ECHU") return <Badge variant="danger">{t("Fin dépassée : décision à prendre")}</Badge>;
  if (etat === "BIENTOT_FINI") return <Badge variant="warning">{t("Fin dans {n} j", { n: jours ?? 0 })}</Badge>;
  if (etat === "EN_COURS") return <Badge variant="info">{jours !== null ? t("{n} j restants", { n: jours }) : t("En cours")}</Badge>;
  return null;
}

const LIBELLE_STATUT: Record<string, { libelle: string; variante: "success" | "neutral" | "warning" | "info" }> = {
  EN_COURS: { libelle: m("En cours"), variante: "info" },
  TERMINE: { libelle: m("Terminé"), variante: "neutral" },
  INTERROMPU: { libelle: m("Interrompu"), variante: "warning" },
  EMBAUCHE: { libelle: m("Embauché(e)"), variante: "success" },
};

/** Stagiaires : les professionnels (employés en période probatoire) et les académiques (fiches sans compte). Administrateur et Managers. */
export default async function PageStagiaires() {
  const t = await getT();
  const dateFr = (d: Date) => new Intl.DateTimeFormat(t.locale, { dateStyle: "medium" }).format(d);
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if ((utilisateurConnecte.role !== "ADMIN" && utilisateurConnecte.role !== "MANAGER") || !peut(utilisateurConnecte, "RH", "VOIR")) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Lock className="size-8 text-muted-foreground" aria-hidden />
        <p className="text-muted-foreground">{t("Les stagiaires sont gérés par l'Administrateur et les Managers.")}</p>
      </div>
    );
  }

  const donnees = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [monEntreprise] = await tx.select({ planAbonnement: entreprise.planAbonnement, statutAbonnement: entreprise.statutAbonnement }).from(entreprise).where(eq(entreprise.id, utilisateurConnecte.entrepriseId));
    if (!disponible(monEntreprise, "RH")) return null;
    return { pros: await listerStagiairesPro(tx, utilisateurConnecte), academiques: await listerStagiairesAcademiques(tx, utilisateurConnecte) };
  });
  if (!donnees) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Lock className="size-8 text-muted-foreground" aria-hidden />
        <p className="text-muted-foreground">{t("Les Ressources Humaines sont disponibles à partir du forfait Business.")}</p>
      </div>
    );
  }
  const maintenant = new Date();
  const pros = donnees.pros;
  const aTraiter = pros.filter((p) => etatStage(p.dateFinContrat, p.decisionStage !== null, maintenant) === "ECHU").length + donnees.academiques.filter((a) => a.statut === "EN_COURS" && etatStage(a.dateFin, false, maintenant) === "ECHU").length;

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <Link href="/app/rh" className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" aria-hidden />
        {t("Ressources humaines")}
      </Link>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <GraduationCap className="size-5" aria-hidden />
          <h1 className="text-2xl font-semibold tracking-tight">{t("Stagiaires")}</h1>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          {peut(utilisateurConnecte, "RH", "CREER") ? (
            <Link href="/app/rh/stagiaires/nouveau-pro" className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
              <Plus className="size-4" aria-hidden />
              {t("Stagiaire professionnel")}
            </Link>
          ) : null}
          {peut(utilisateurConnecte, "RH", "CREER") ? (
            <Link href="/app/rh/stagiaires/nouveau" className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-3 py-2 text-sm font-medium hover:bg-muted/50">
              <Plus className="size-4" aria-hidden />
              {t("Stagiaire académique")}
            </Link>
          ) : null}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
        <div className="rounded-xl border bg-card p-4">
          <p className="font-semibold">{t("Stagiaire professionnel")}</p>
          <p className="mt-1 text-muted-foreground">{t("Une personne qui travaille déjà pour vous, en période probatoire : elle a un compte et un poste, est rémunérée, et ses présences se suivent comme celles d'un employé. À la fin, vous décidez : l'embaucher (CDI ou CDD) ou ne pas la retenir.")}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="font-semibold">{t("Stagiaire académique")}</p>
          <p className="mt-1 text-muted-foreground">{t("Un étudiant en stage de formation : une fiche (école, convention, tuteur, mission, maître de stage), sans compte. À la fin : stage terminé, interrompu, ou invitation d'embauche s'il est pris.")}</p>
        </div>
      </div>
      {aTraiter > 0 ? <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">{t("{n} stage(s) ont dépassé leur date de fin sans décision : ouvrez la fiche pour trancher.", { n: aTraiter })}</p> : null}

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-muted-foreground">{t("Stagiaires professionnels — période probatoire ({n})", { n: pros.length })}</h2>
        <p className="text-xs text-muted-foreground">{t("Employés de contrat « Stage » qui occupent déjà un poste. Ajoutez-en un avec « Stagiaire professionnel » (invitation par email, date de fin obligatoire ; Administrateur ou Manager) ; à la fin, l'Administrateur décide : embauché ou non retenu.")}</p>
        <Card className="p-0">
          <div className="flex flex-col divide-y divide-border">
            {pros.map((p) => {
              const etat = etatStage(p.dateFinContrat, p.decisionStage !== null, maintenant);
              return (
                <Link key={p.id} href={`/app/rh/${p.id}`} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm hover:bg-muted/50">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{p.nomComplet}</p>
                    <p className="text-xs text-muted-foreground">
                      {t("{poste} — depuis le {date}", { poste: p.poste, date: dateFr(p.dateEmbauche) })}
                      {p.dateFinContrat && !p.decisionStage ? ` · ${t("fin prévue le {date}", { date: dateFr(p.dateFinContrat) })}` : ""}
                    </p>
                  </div>
                  {p.decisionStage ? (
                    <Badge variant={p.decisionStage === "EMBAUCHE" ? "success" : "neutral"}>{p.decisionStage === "EMBAUCHE" ? t("Embauché(e)") : t("Non retenu(e)")}</Badge>
                  ) : (
                    <BadgeEtat etat={etat} jours={p.dateFinContrat ? joursRestants(p.dateFinContrat, maintenant) : null} />
                  )}
                </Link>
              );
            })}
            {pros.length === 0 ? <p className="px-4 py-4 text-sm text-muted-foreground">{t("Aucun stagiaire professionnel pour le moment.")}</p> : null}
          </div>
        </Card>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-muted-foreground">{t("Stagiaires académiques ({n})", { n: donnees.academiques.length })}</h2>
        <Card className="p-0">
          <div className="flex flex-col divide-y divide-border">
            {donnees.academiques.map((a) => {
              const etat = etatStage(a.dateFin, a.statut !== "EN_COURS", maintenant);
              const statut = LIBELLE_STATUT[a.statut] ?? { libelle: a.statut, variante: "neutral" as const };
              return (
                <Link key={a.id} href={`/app/rh/stagiaires/${a.id}`} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm hover:bg-muted/50">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{a.nom}</p>
                    <p className="text-xs text-muted-foreground">
                      {a.etablissement}
                      {a.filiere ? ` — ${a.filiere}` : ""} · {t("du {debut} au {fin}", { debut: dateFr(a.dateDebut), fin: dateFr(a.dateFin) })}
                    </p>
                  </div>
                  {a.statut === "EN_COURS" ? <BadgeEtat etat={etat} jours={joursRestants(a.dateFin, maintenant)} /> : <Badge variant={statut.variante}>{t(statut.libelle)}</Badge>}
                </Link>
              );
            })}
            {donnees.academiques.length === 0 ? <p className="px-4 py-4 text-sm text-muted-foreground">{t("Aucun stagiaire académique pour le moment.")}</p> : null}
          </div>
        </Card>
      </section>
    </div>
  );
}
