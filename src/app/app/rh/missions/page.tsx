import { redirect } from "next/navigation";
import { Lock } from "lucide-react";
import { avecEntreprise } from "@/db/client";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { getT } from "@/lib/i18n/langue";
import { aujourdhuiDouala } from "@/lib/facturation/promesse-regles";
import { etatMission, joursRestants } from "@/lib/rh/missions-regles";
import { lireMissions, peutGererMissions, personnesAssignables, ressourcesHumainesDisponibles, type MissionLue } from "@/lib/rh/missions";
import { idsVisibles } from "@/lib/portee";
import { FormulaireMission, ListeMissions, type MissionAffichee } from "./liste-missions";

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
  const personnesAvecMissions = [...new Map(autres.map((x) => [x.utilisateurId, x.nomPersonne])).entries()].sort((a, b) => a[1].localeCompare(b[1]));

  // Vue d'ensemble : une ligne par personne que l'on gère (y compris celles sans mission), pour voir d'un coup d'œil qui est chargé ou en retard sans ouvrir de fiche.
  const nomsEquipe = new Map<string, string>(personnes.filter((p) => p.id !== u.utilisateurId).map((p) => [p.id, p.nom]));
  for (const [id, nom] of personnesAvecMissions) nomsEquipe.set(id, nom);
  const synthese = [...nomsEquipe.entries()]
    .map(([id, nom]) => {
      const siennes = autres.filter((x) => x.utilisateurId === id);
      return {
        id,
        nom,
        total: siennes.length,
        enCours: siennes.filter((x) => x.etat === "EN_COURS" || x.etat === "A_VENIR").length,
        enRetard: siennes.filter((x) => x.etat === "EN_RETARD").length,
        terminees: siennes.filter((x) => x.etat === "TERMINEE").length,
      };
    })
    .sort((a, b) => b.enRetard - a.enRetard || a.nom.localeCompare(b.nom));

  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("Missions")}</h1>
        <p className="text-muted-foreground">{t("Ce que chacun doit accomplir : la semaine, le mois, sur la durée, ou en permanence.")}</p>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t("Mes missions")}</h2>
        <ListeMissions missions={mesMissions} vide={t("Aucune mission ne vous a été confiée pour l'instant.")} />
      </section>

      {personnes.length > 0 || autres.length > 0 ? (
        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold">{t("Missions de l'équipe")}</h2>
          {synthese.length > 0 ? (
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-sm">
                <caption className="sr-only">{t("Vue d'ensemble des missions de l'équipe")}</caption>
                <thead>
                  <tr className="border-b bg-muted/40 text-left text-muted-foreground">
                    <th className="px-3.5 py-2 font-medium">{t("Personne")}</th>
                    <th className="px-3.5 py-2 text-right font-medium whitespace-nowrap">{t("En cours")}</th>
                    <th className="px-3.5 py-2 text-right font-medium whitespace-nowrap">{t("En retard")}</th>
                    <th className="px-3.5 py-2 text-right font-medium whitespace-nowrap">{t("Terminées")}</th>
                  </tr>
                </thead>
                <tbody>
                  {synthese.map((l) => (
                    <tr key={l.id} className="border-b last:border-0">
                      <td className="px-3.5 py-2">
                        {l.total > 0 ? (
                          <a href={`#personne-${l.id}`} className="text-primary underline-offset-4 hover:underline">
                            {l.nom}
                          </a>
                        ) : (
                          <span>
                            {l.nom} <span className="text-xs text-muted-foreground">· {t("aucune mission")}</span>
                          </span>
                        )}
                      </td>
                      <td className="px-3.5 py-2 text-right tabular-nums">{l.enCours}</td>
                      <td className={`px-3.5 py-2 text-right tabular-nums ${l.enRetard > 0 ? "font-medium text-destructive" : ""}`}>{l.enRetard}</td>
                      <td className="px-3.5 py-2 text-right tabular-nums">{l.terminees}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          <FormulaireMission personnes={personnes} aujourdhui={aujourdhui} />
          {personnesAvecMissions.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("Aucune mission confiée à l'équipe pour l'instant.")}</p>
          ) : (
            personnesAvecMissions.map(([id, nom]) => (
              <div key={id} id={`personne-${id}`} className="flex scroll-mt-20 flex-col gap-2">
                <h3 className="text-base font-medium">{nom}</h3>
                <ListeMissions missions={autres.filter((x) => x.utilisateurId === id)} />
              </div>
            ))
          )}
        </section>
      ) : null}
    </div>
  );
}
