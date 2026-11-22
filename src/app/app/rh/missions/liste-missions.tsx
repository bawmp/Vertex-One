"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { Plus, RotateCcw, Trash2, Ban, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { creerMissionAction, gererMissionAction, suivreMissionAction } from "@/lib/actions/missions";
import { ETAT_MISSION, HORIZONS, LIBELLE_HORIZON, TITRE_SECTION_HORIZON, aUnAvancement, type EtatMission, type HorizonMission } from "@/lib/rh/missions-regles";
import { useT } from "@/lib/i18n/contexte";
import { m } from "@/lib/i18n/catalogue";

/** Mission prête à afficher : les droits (`peutSuivre`, `peutGerer`) sont calculés par le serveur, qui les revérifie à chaque action. */
export type MissionAffichee = {
  id: string;
  utilisateurId: string;
  nomPersonne: string;
  titre: string;
  description: string | null;
  resultatAttendu: string | null;
  horizon: HorizonMission;
  dateDebut: string;
  dateFin: string | null;
  statut: "EN_COURS" | "TERMINEE" | "ANNULEE";
  avancement: number;
  noteSuivi: string | null;
  suiviLe: string | null;
  etat: EtatMission;
  joursRestants: number | null;
  peutSuivre: boolean;
  peutGerer: boolean;
};

function CarteMission({ mission: x, afficherPersonne }: { mission: MissionAffichee; afficherPersonne: boolean }) {
  const t = useT();
  const [ouvert, setOuvert] = useState(false);
  const [avancement, setAvancement] = useState(String(x.avancement));
  const [note, setNote] = useState(x.noteSuivi ?? "");
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, startTransition] = useTransition();
  const etat = ETAT_MISSION[x.etat];
  const jour = (j: string) => new Intl.DateTimeFormat(t.locale, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${j}T00:00:00Z`));
  const actif = x.statut === "EN_COURS";
  const avecAvancement = aUnAvancement(x.horizon);

  function suivre(terminer: boolean) {
    setErreur(null);
    startTransition(async () => {
      const r = await suivreMissionAction(x.id, Number(avancement), note, terminer);
      if (r?.erreur) setErreur(r.erreur);
      else setOuvert(false);
    });
  }
  function gerer(action: "ANNULER" | "ROUVRIR" | "SUPPRIMER") {
    setErreur(null);
    startTransition(async () => {
      const r = await gererMissionAction(x.id, action);
      if (r?.erreur) setErreur(r.erreur);
    });
  }

  return (
    <li className="flex flex-col gap-2.5 px-3.5 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{x.titre}</p>
          {afficherPersonne ? <p className="text-xs text-muted-foreground">{x.nomPersonne}</p> : null}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          <Badge variant="neutral">{t(LIBELLE_HORIZON[x.horizon])}</Badge>
          <Badge variant={etat.variante}>{t(etat.libelle)}</Badge>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        {x.dateFin ? t("Du {debut} au {fin}", { debut: jour(x.dateDebut), fin: jour(x.dateFin) }) : t("Depuis le {debut}", { debut: jour(x.dateDebut) })}
        {actif && x.joursRestants !== null && x.etat !== "A_VENIR"
          ? ` · ${x.joursRestants < 0 ? t("{n} jours de retard", { n: String(-x.joursRestants) }) : x.joursRestants === 0 ? t("dernier jour") : t("{n} jours restants", { n: String(x.joursRestants) })}`
          : ""}
      </p>

      {x.description ? <p className="text-xs whitespace-pre-line text-muted-foreground">{x.description}</p> : null}
      {x.resultatAttendu ? (
        <p className="text-xs">
          <span className="font-medium">{t("Résultat attendu :")}</span> {x.resultatAttendu}
        </p>
      ) : null}

      {avecAvancement ? (
        <div className="flex items-center gap-2" aria-label={t("Avancement")}>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            <div className={`h-full rounded-full ${x.statut === "TERMINEE" ? "bg-emerald-500" : "bg-primary"}`} style={{ width: `${x.avancement}%` }} />
          </div>
          <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">{x.avancement} %</span>
        </div>
      ) : null}

      {x.noteSuivi ? (
        <p className="rounded-lg bg-muted/50 px-2.5 py-1.5 text-xs whitespace-pre-line">
          <span className="font-medium">{t("Point de suivi :")}</span> {x.noteSuivi}
        </p>
      ) : null}

      {ouvert ? (
        <div className="flex flex-col gap-2.5 rounded-xl border border-border p-3">
          {avecAvancement ? (
            <div className="flex flex-col gap-1 sm:max-w-40">
              <Label htmlFor={`avancement-${x.id}`}>{t("Avancement (%)")}</Label>
              <Input id={`avancement-${x.id}`} type="number" inputMode="numeric" min={0} max={100} step={1} value={avancement} onChange={(e) => setAvancement(e.target.value)} />
            </div>
          ) : null}
          <div className="flex flex-col gap-1">
            <Label htmlFor={`note-${x.id}`}>{t("Point de suivi (optionnel)")}</Label>
            <Textarea id={`note-${x.id}`} rows={3} maxLength={600} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("Où en êtes-vous, qu'est-ce qui bloque ?")} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" disabled={enCours} onClick={() => suivre(false)}>
              {enCours ? <Spinner /> : null}
              {t("Enregistrer")}
            </Button>
            {avecAvancement ? (
              <Button type="button" size="sm" variant="outline" disabled={enCours} onClick={() => suivre(true)}>
                <CheckCircle2 data-icon="inline-start" aria-hidden />
                {t("Marquer comme terminée")}
              </Button>
            ) : null}
            <Button type="button" size="sm" variant="ghost" disabled={enCours} onClick={() => setOuvert(false)}>
              {t("Annuler")}
            </Button>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-1.5">
        {actif && x.peutSuivre && !ouvert ? (
          <Button type="button" size="sm" variant="outline" onClick={() => setOuvert(true)}>
            {t("Mettre à jour")}
          </Button>
        ) : null}
        {x.peutGerer && actif ? (
          <Button type="button" size="sm" variant="ghost" disabled={enCours} onClick={() => gerer("ANNULER")}>
            <Ban data-icon="inline-start" aria-hidden />
            {t("Annuler la mission")}
          </Button>
        ) : null}
        {x.peutGerer && !actif ? (
          <Button type="button" size="sm" variant="ghost" disabled={enCours} onClick={() => gerer("ROUVRIR")}>
            <RotateCcw data-icon="inline-start" aria-hidden />
            {t("Rouvrir")}
          </Button>
        ) : null}
        {x.peutGerer ? (
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            disabled={enCours}
            aria-label={t("Supprimer la mission")}
            className="text-muted-foreground hover:text-destructive"
            onClick={() => {
              if (window.confirm(t("Supprimer cette mission ? Préférez « Annuler la mission » pour en garder la trace."))) gerer("SUPPRIMER");
            }}
          >
            <Trash2 className="size-3.5" aria-hidden />
          </Button>
        ) : null}
      </div>
      {erreur ? <p role="alert" className="text-xs text-destructive">{erreur}</p> : null}
    </li>
  );
}

/** Missions rangées par durée : la semaine, le mois, la longue durée, puis les missions permanentes. Les missions closes ou annulées sont repliées. */
export function ListeMissions({ missions, afficherPersonne = false, vide }: { missions: MissionAffichee[]; afficherPersonne?: boolean; vide?: string }) {
  const t = useT();
  const actives = missions.filter((x) => x.statut === "EN_COURS");
  const closes = missions.filter((x) => x.statut !== "EN_COURS");

  if (missions.length === 0) return <p className="text-sm text-muted-foreground">{vide ?? t("Aucune mission pour l'instant.")}</p>;

  return (
    <div className="flex flex-col gap-4">
      {HORIZONS.map((h) => {
        const duGroupe = actives.filter((x) => x.horizon === h);
        if (duGroupe.length === 0) return null;
        return (
          <section key={h} className="flex flex-col gap-1.5">
            <h3 className="text-sm font-semibold">{t(TITRE_SECTION_HORIZON[h])}</h3>
            <ul className="flex flex-col divide-y divide-border rounded-xl border border-border">
              {duGroupe.map((x) => (
                <CarteMission key={x.id} mission={x} afficherPersonne={afficherPersonne} />
              ))}
            </ul>
          </section>
        );
      })}
      {actives.length === 0 ? <p className="text-sm text-muted-foreground">{t("Aucune mission en cours.")}</p> : null}
      {closes.length > 0 ? (
        <details className="rounded-xl border border-border">
          <summary className="cursor-pointer px-3.5 py-2.5 text-sm font-medium">{t("Terminées et annulées ({n})", { n: String(closes.length) })}</summary>
          <ul className="flex flex-col divide-y divide-border border-t border-border">
            {closes.map((x) => (
              <CarteMission key={x.id} mission={x} afficherPersonne={afficherPersonne} />
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

const AIDE_HORIZON: Record<HorizonMission, string> = {
  HEBDOMADAIRE: m("La mission dure 7 jours à partir de la date de début."),
  MENSUELLE: m("La mission dure un mois à partir de la date de début."),
  LONGUE_DUREE: m("Vous fixez la date de fin (trois ans au plus)."),
  PERMANENTE: m("Sans date de fin : une responsabilité qui reste tant qu'elle n'est pas annulée."),
};

/** Formulaire pour confier une mission. Avec une seule personne possible (fiche d'un collaborateur) le choix de la personne est fixé. */
export function FormulaireMission({ personnes, personneFixeId, aujourdhui }: { personnes: { id: string; nom: string }[]; personneFixeId?: string; aujourdhui: string }) {
  const t = useT();
  const formulaire = useRef<HTMLFormElement>(null);
  const [ouvert, setOuvert] = useState(false);
  const [horizon, setHorizon] = useState<HorizonMission>("HEBDOMADAIRE");
  const [etat, action, enCours] = useActionState(async (precedent: Awaited<ReturnType<typeof creerMissionAction>>, formData: FormData) => {
    const r = await creerMissionAction(precedent, formData);
    if (r?.message) {
      formulaire.current?.reset();
      setHorizon("HEBDOMADAIRE");
      setOuvert(false);
    }
    return r;
  }, null);

  if (personnes.length === 0) return null;

  if (!ouvert) {
    return (
      <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => setOuvert(true)}>
        <Plus data-icon="inline-start" aria-hidden />
        {t("Confier une mission")}
      </Button>
    );
  }

  return (
    <form ref={formulaire} action={action} className="flex flex-col gap-3 rounded-xl border border-border p-3.5">
      {personneFixeId ? (
        <input type="hidden" name="utilisateurId" value={personneFixeId} />
      ) : (
        <div className="flex flex-col gap-1 sm:max-w-72">
          <Label htmlFor="mission-personne">{t("Confier à")}</Label>
          <Select id="mission-personne" name="utilisateurId" required defaultValue="">
            <option value="" disabled>
              {t("Choisir une personne")}
            </option>
            {personnes.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nom}
              </option>
            ))}
          </Select>
        </div>
      )}
      <div className="flex flex-col gap-1">
        <Label htmlFor="mission-titre">{t("Mission")}</Label>
        <Input id="mission-titre" name="titre" required minLength={3} maxLength={120} placeholder={t("Ex. : signer 5 nouveaux clients")} />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="mission-resultat">{t("Résultat attendu (optionnel)")}</Label>
        <Input id="mission-resultat" name="resultatAttendu" maxLength={300} placeholder={t("Ex. : 5 contrats signés avant la fin du mois")} />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="mission-description">{t("Détail (optionnel)")}</Label>
        <Textarea id="mission-description" name="description" rows={3} maxLength={600} />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="mission-horizon">{t("Durée")}</Label>
          <Select id="mission-horizon" name="horizon" value={horizon} onChange={(e) => setHorizon(e.target.value as HorizonMission)}>
            {HORIZONS.map((h) => (
              <option key={h} value={h}>
                {t(LIBELLE_HORIZON[h])}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="mission-debut">{t("Début")}</Label>
          <Input id="mission-debut" name="dateDebut" type="date" required defaultValue={aujourdhui} />
        </div>
        {horizon === "LONGUE_DUREE" ? (
          <div className="flex flex-col gap-1">
            <Label htmlFor="mission-fin">{t("Fin")}</Label>
            <Input id="mission-fin" name="dateFin" type="date" required />
          </div>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">{t(AIDE_HORIZON[horizon])}</p>
      {etat?.erreur ? <p role="alert" className="text-sm text-destructive">{etat.erreur}</p> : null}
      {etat?.message ? <p role="status" className="text-sm text-emerald-700 dark:text-emerald-300">{etat.message}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={enCours}>
          {enCours ? <Spinner /> : null}
          {t("Confier la mission")}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOuvert(false)}>
          {t("Annuler")}
        </Button>
      </div>
    </form>
  );
}
