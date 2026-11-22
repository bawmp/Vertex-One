import { redirect } from "next/navigation";
import { Lock, Target, Users } from "lucide-react";
import { avecEntreprise } from "@/db/client";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { getT } from "@/lib/i18n/langue";
import { aujourdhuiDouala } from "@/lib/facturation/promesse-regles";
import { aUnAvancement, etatMission, joursRestants } from "@/lib/rh/missions-regles";
import { lireMissions, peutGererMissions, personnesAssignables, ressourcesHumainesDisponibles, type MissionLue } from "@/lib/rh/missions";
import { idsVisibles } from "@/lib/portee";
import { AvatarCollaborateur } from "@/components/avatar-collaborateur";
import { TuileChiffre } from "@/components/fiche/fiche-ui";
import { FormulaireMission, ListeMissions, type MissionAffichee } from "./liste-missions";

/** Avancement moyen des missions en cours qui ont un pourcentage (les permanentes n'en ont pas) ; null s'il n'y en a aucune. */
function avancementMoyen(missions: MissionAffichee[]): number | null {
  const suivies = missions.filter((x) => x.statut === "EN_COURS" && aUnAvancement(x.horizon));
  return suivies.length ? Math.round(suivies.reduce((somme, x) => somme + x.avancement, 0) / suivies.length) : null;
}

const compter = (missions: MissionAffichee[]) => ({
  enCours: missions.filter((x) => x.etat === "EN_COURS" || x.etat === "A_VENIR").length,
  enRetard: missions.filter((x) => x.etat === "EN_RETARD").length,
  terminees: missions.filter((x) => x.etat === "TERMINEE").length,
});

export default async function PageMissions() {
  const t = await getT();
  const u = await recupererUtilisateurConnecte();
  if (!u) redirect("/connexion");
  if (!peut(u, "RH", "VOIR")) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Lock className="size-8 text-muted-foreground" aria-hidden />
        <p className="text-muted-foreground">{t("Vous n'avez pas accès aux Ressources Humaines.")}</p>
      </div>
    );
  }

  const aujourdhui = aujourdhuiDouala();
  const donnees = await avecEntreprise(u.entrepriseId, async (tx) => {
    if (!(await ressourcesHumainesDisponibles(tx, u.entrepriseId))) return null;
    const ids = u.role === "ADMIN" ? "TOUT" : await idsVisibles(tx, u, "RH");
    const [lues, personnes] = await Promise.all([lireMissions(tx, u), personnesAssignables(tx, u)]);
    const affichees: MissionAffichee[] = lues.map((l: MissionLue) => ({
      id: l.id,
      utilisateurId: l.utilisateurId,
      nomPersonne: l.nomPersonne,
      titre: l.titre,
      description: l.description,
      resultatAttendu: l.resultatAttendu,
      horizon: l.horizon,
      dateDebut: l.dateDebut,
      dateFin: l.dateFin,
      statut: l.statut,
      avancement: l.avancement,
      noteSuivi: l.noteSuivi,
      suiviLe: l.suiviLe ? l.suiviLe.toISOString() : null,
      etat: etatMission(l, aujourdhui),
      joursRestants: joursRestants(l.dateFin, aujourdhui),
      peutSuivre: l.utilisateurId === u.utilisateurId || peutGererMissions(u, l.utilisateurId, ids),
      reconduction: l.reconduction,
      peutGerer: peutGererMissions(u, l.utilisateurId, ids),
    }));
    return { affichees, personnes };
  });

  if (!donnees) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Lock className="size-8 text-muted-foreground" aria-hidden />
        <p className="text-muted-foreground">{t("Votre abonnement est suspendu : renouvelez-le pour accéder à cette fonctionnalité.")}</p>
      </div>
    );
  }

  const { affichees, personnes } = donnees;
  const mesMissions = affichees.filter((x) => x.utilisateurId === u.utilisateurId);
  const autres = affichees.filter((x) => x.utilisateurId !== u.utilisateurId);
  const mesChiffres = compter(mesMissions);
  const moyenne = avancementMoyen(mesMissions);

  // Équipe : une carte par personne que l'on gère (y compris celles sans mission), les plus en retard d'abord.
  const noms = new Map<string, string>(personnes.filter((p) => p.id !== u.utilisateurId).map((p) => [p.id, p.nom]));
  for (const x of autres) noms.set(x.utilisateurId, x.nomPersonne);
  const equipe = [...noms.entries()]
    .map(([id, nom]) => {
      const siennes = autres.filter((x) => x.utilisateurId === id);
      return { id, nom, missions: siennes, ...compter(siennes), moyenne: avancementMoyen(siennes) };
    })
    .sort((a, b) => b.enRetard - a.enRetard || a.nom.localeCompare(b.nom));
  const totalEquipe = compter(autres);

  return (
    <div className="flex max-w-3xl flex-col gap-10">
      <header className="relative overflow-hidden rounded-3xl bg-linear-to-br from-marque-bleu-800 to-marque-bleu-600 px-6 py-6 text-white shadow-sm sm:px-8">
        <span aria-hidden className="absolute -top-10 -right-10 size-44 rounded-full bg-marque-orange/25 blur-2xl" />
        <div className="relative flex items-center gap-4">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-white/15 backdrop-blur">
            <Target className="size-6" aria-hidden />
          </span>
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight">{t("Missions")}</h1>
            <p className="text-sm text-white/80">{t("Ce que chacun doit accomplir : la semaine, le mois, sur la durée, ou en permanence.")}</p>
          </div>
        </div>
      </header>

      <section className="flex flex-col gap-4" aria-labelledby="mes-missions">
        <h2 id="mes-missions" className="text-lg font-semibold">
          {t("Mes missions")}
        </h2>
        {mesMissions.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <TuileChiffre valeur={mesChiffres.enCours} libelle={t("En cours")} ton="bleu" />
            <TuileChiffre valeur={mesChiffres.enRetard} libelle={t("En retard")} ton={mesChiffres.enRetard > 0 ? "alerte" : "neutre"} />
            <TuileChiffre valeur={mesChiffres.terminees} libelle={t("Terminées")} ton="succes" />
            <TuileChiffre valeur={moyenne === null ? "—" : `${moyenne} %`} libelle={t("Avancement moyen")} />
          </div>
        ) : null}
        <ListeMissions missions={mesMissions} vide={t("Aucune mission ne vous a été confiée pour l'instant.")} />
      </section>

      {personnes.length > 0 || autres.length > 0 ? (
        <section className="flex flex-col gap-5" aria-labelledby="equipe-missions">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="equipe-missions" className="flex items-center gap-2 text-lg font-semibold">
              <Users className="size-5 text-muted-foreground" aria-hidden />
              {t("Missions de l'équipe")}
            </h2>
            <p className="text-sm text-muted-foreground">
              {t("{n} en cours", { n: String(totalEquipe.enCours) })}
              {totalEquipe.enRetard > 0 ? <span className="font-medium text-destructive"> · {t("{n} en retard", { n: String(totalEquipe.enRetard) })}</span> : null}
            </p>
          </div>

          <FormulaireMission personnes={personnes} aujourdhui={aujourdhui} />

          {equipe.length > 0 ? (
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2" aria-label={t("Vue d'ensemble des missions de l'équipe")}>
              {equipe.map((p) => (
                <li key={p.id} className="rounded-2xl border border-border bg-card p-3.5 shadow-xs transition-shadow hover:shadow-md">
                  <a href={p.missions.length > 0 ? `#personne-${p.id}` : undefined} className="flex items-center gap-3">
                    <AvatarCollaborateur nom={p.nom} adresse={null} taille="petit" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{p.nom}</span>
                      <span className="block text-xs text-muted-foreground">
                        {p.missions.length === 0 ? t("aucune mission") : t("{n} en cours", { n: String(p.enCours) })}
                        {p.enRetard > 0 ? <span className="font-medium text-destructive"> · {t("{n} en retard", { n: String(p.enRetard) })}</span> : null}
                        {p.terminees > 0 ? ` · ${t("{n} terminées", { n: String(p.terminees) })}` : ""}
                      </span>
                    </span>
                  </a>
                  {p.moyenne !== null ? (
                    <div className="mt-2.5 flex items-center gap-2" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={p.moyenne} aria-label={t("Avancement moyen")}>
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                        <div className={`h-full rounded-full ${p.enRetard > 0 ? "bg-destructive" : "bg-primary"}`} style={{ width: `${p.moyenne}%` }} />
                      </div>
                      <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">{p.moyenne} %</span>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}

          {equipe
            .filter((p) => p.missions.length > 0)
            .map((p) => (
              <div key={p.id} id={`personne-${p.id}`} className="flex scroll-mt-20 flex-col gap-3">
                <h3 className="flex items-center gap-2 text-base font-semibold">
                  <AvatarCollaborateur nom={p.nom} adresse={null} taille="petit" />
                  {p.nom}
                </h3>
                <ListeMissions missions={p.missions} />
              </div>
            ))}
        </section>
      ) : null}
    </div>
  );
}
