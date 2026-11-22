"use client";

import { useActionState, useRef, useState, useTransition, type ComponentType } from "react";
import { Ban, CalendarDays, CalendarRange, CheckCircle2, Clock, Flag, PartyPopper, Plus, Repeat, Repeat2, RotateCcw, Target, Trash2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { AvatarCollaborateur } from "@/components/avatar-collaborateur";
import { creerMissionAction, definirReconductionAction, gererMissionAction, suivreMissionAction } from "@/lib/actions/missions";
import { ETAT_MISSION, HORIZONS, LIBELLE_HORIZON, aUnAvancement, peutSeRenouveler, type EtatMission, type HorizonMission } from "@/lib/rh/missions-regles";
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
  statut: "EN_COURS" | "TERMINEE" | "ANNULEE" | "CLOTUREE";
  avancement: number;
  noteSuivi: string | null;
  suiviLe: string | null;
  etat: EtatMission;
  joursRestants: number | null;
  /** Se recrée toute seule à la fin de sa période (missions de la semaine et du mois). */
  reconduction: boolean;
  peutSuivre: boolean;
  peutGerer: boolean;
};

type IconeLucide = ComponentType<{ className?: string; "aria-hidden"?: boolean }>;

const ICONE_HORIZON: Record<HorizonMission, IconeLucide> = { HEBDOMADAIRE: CalendarDays, MENSUELLE: CalendarRange, LONGUE_DUREE: Flag, PERMANENTE: Repeat };

/** Pastille de couleur de l'icône d'horizon, et liseré de la carte, selon l'état : le retard saute aux yeux, le terminé rassure. */
const LISERE: Record<EtatMission, string> = { EN_RETARD: "bg-destructive", EN_COURS: "bg-primary", A_VENIR: "bg-marque-orange", TERMINEE: "bg-emerald-500", ANNULEE: "bg-muted-foreground/30", CLOTUREE: "bg-muted-foreground/30" };
const BARRE: Record<EtatMission, string> = { EN_RETARD: "bg-destructive", EN_COURS: "bg-primary", A_VENIR: "bg-marque-orange", TERMINEE: "bg-emerald-500", ANNULEE: "bg-muted-foreground/40", CLOTUREE: "bg-muted-foreground/40" };
const PASTILLE: Record<EtatMission, string> = {
  EN_RETARD: "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300",
  EN_COURS: "bg-marque-bleu-100 text-marque-bleu-800 dark:bg-marque-bleu-800 dark:text-marque-bleu-50",
  A_VENIR: "bg-marque-orange-100 text-marque-orange-600 dark:bg-marque-orange-900/30",
  TERMINEE: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300",
  ANNULEE: "bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400",
  CLOTUREE: "bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400",
};
const PALIERS = [0, 25, 50, 75, 100];

function CarteMission({ mission: x, afficherPersonne }: { mission: MissionAffichee; afficherPersonne: boolean }) {
  const t = useT();
  const [ouvert, setOuvert] = useState(false);
  const [avancement, setAvancement] = useState(x.avancement);
  const [note, setNote] = useState(x.noteSuivi ?? "");
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, startTransition] = useTransition();
  const etat = ETAT_MISSION[x.etat];
  const Icone = ICONE_HORIZON[x.horizon];
  const jour = (j: string) => new Intl.DateTimeFormat(t.locale, { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${j}T00:00:00Z`));
  const actif = x.statut === "EN_COURS";
  const avecAvancement = aUnAvancement(x.horizon);

  // Échéance en une phrase courte, la plus utile à ce moment (retard, dernier jour, jours restants, début à venir).
  let echeance: string | null = null;
  if (actif && x.etat === "A_VENIR") echeance = t("Commence le {date}", { date: jour(x.dateDebut) });
  else if (actif && x.joursRestants !== null) echeance = x.joursRestants < 0 ? t("{n} jours de retard", { n: String(-x.joursRestants) }) : x.joursRestants === 0 ? t("dernier jour") : t("{n} jours restants", { n: String(x.joursRestants) });

  function suivre(terminer: boolean) {
    setErreur(null);
    startTransition(async () => {
      const r = await suivreMissionAction(x.id, avancement, note, terminer);
      if (r?.erreur) setErreur(r.erreur);
      else setOuvert(false);
    });
  }
  function basculerReconduction(actif: boolean) {
    setErreur(null);
    startTransition(async () => {
      const r = await definirReconductionAction(x.id, actif);
      if (r?.erreur) setErreur(r.erreur);
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
    <li className={`relative flex animate-in flex-col gap-3 overflow-hidden rounded-2xl border border-border bg-card py-4 pr-4 pl-5 shadow-xs transition-shadow duration-300 fade-in slide-in-from-bottom-1 hover:shadow-md ${x.statut === "ANNULEE" ? "opacity-70" : ""}`}>
      <span aria-hidden className={`absolute inset-y-0 left-0 w-1.5 ${LISERE[x.etat]}`} />

      <div className="flex items-start gap-3">
        <span className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${PASTILLE[x.etat]}`} title={t(LIBELLE_HORIZON[x.horizon])}>
          <Icone className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
            <h3 className="min-w-0 text-[15px] leading-snug font-semibold">{x.titre}</h3>
            <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${PASTILLE[x.etat]}`}>
              {x.etat === "TERMINEE" ? <CheckCircle2 className="size-3.5" aria-hidden /> : x.etat === "EN_RETARD" ? <TriangleAlert className="size-3.5" aria-hidden /> : null}
              {t(etat.libelle)}
            </span>
          </div>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span>{t(LIBELLE_HORIZON[x.horizon])}</span>
            <span aria-hidden>·</span>
            <span>{x.dateFin ? t("Du {debut} au {fin}", { debut: jour(x.dateDebut), fin: jour(x.dateFin) }) : t("Depuis le {debut}", { debut: jour(x.dateDebut) })}</span>
            {x.reconduction && x.statut !== "ANNULEE" ? (
              <span className="inline-flex items-center gap-1 text-marque-bleu-700 dark:text-marque-bleu-200">
                <Repeat2 className="size-3" aria-hidden />
                {x.horizon === "HEBDOMADAIRE" ? t("Se renouvelle chaque semaine") : t("Se renouvelle chaque mois")}
              </span>
            ) : null}
            {echeance ? (
              <span className={`inline-flex items-center gap-1 font-medium ${x.etat === "EN_RETARD" ? "text-destructive" : "text-foreground"}`}>
                <Clock className="size-3" aria-hidden />
                {echeance}
              </span>
            ) : null}
          </p>
        </div>
      </div>

      {afficherPersonne ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <AvatarCollaborateur nom={x.nomPersonne} adresse={null} taille="petit" />
          {x.nomPersonne}
        </div>
      ) : null}

      {x.description ? <p className="text-sm whitespace-pre-line text-muted-foreground">{x.description}</p> : null}
      {x.resultatAttendu ? (
        <p className="flex items-start gap-2 rounded-xl bg-muted/50 px-3 py-2 text-sm">
          <Target className="mt-0.5 size-4 shrink-0 text-marque-orange-600" aria-hidden />
          <span>
            <span className="font-medium">{t("Résultat attendu :")}</span> {x.resultatAttendu}
          </span>
        </p>
      ) : null}

      {avecAvancement ? (
        <div className="flex items-center gap-3" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={x.avancement} aria-label={t("Avancement")}>
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
            <div className={`h-full rounded-full transition-[width] duration-700 ease-out ${BARRE[x.etat]}`} style={{ width: `${x.avancement}%` }} />
          </div>
          <span className="w-10 text-right text-sm font-semibold tabular-nums">{x.avancement} %</span>
        </div>
      ) : null}

      {x.noteSuivi ? (
        <p className="rounded-xl border border-dashed border-border px-3 py-2 text-sm whitespace-pre-line">
          <span className="font-medium">{t("Point de suivi :")}</span> {x.noteSuivi}
        </p>
      ) : null}

      {ouvert ? (
        <div className="flex animate-in flex-col gap-3 rounded-xl bg-muted/40 p-3.5 duration-300 fade-in slide-in-from-top-1">
          {avecAvancement ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <Label htmlFor={`avancement-${x.id}`}>{t("Où en êtes-vous ?")}</Label>
                <span className="text-lg font-semibold tabular-nums">{avancement} %</span>
              </div>
              <input id={`avancement-${x.id}`} type="range" min={0} max={100} step={5} value={avancement} onChange={(e) => setAvancement(Number(e.target.value))} className="h-2 w-full cursor-pointer accent-primary" />
              <div className="flex flex-wrap gap-1.5">
                {PALIERS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setAvancement(p)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium tabular-nums transition-colors ${avancement === p ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:border-primary/50"}`}
                  >
                    {p} %
                  </button>
                ))}
              </div>
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
              <Button type="button" size="sm" variant="outline" disabled={enCours} onClick={() => suivre(true)} className="border-emerald-500/40 text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-500/10">
                <PartyPopper data-icon="inline-start" aria-hidden />
                {t("Marquer comme terminée")}
              </Button>
            ) : null}
            <Button type="button" size="sm" variant="ghost" disabled={enCours} onClick={() => { setOuvert(false); setAvancement(x.avancement); setNote(x.noteSuivi ?? ""); }}>
              {t("Annuler")}
            </Button>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-1.5">
        {actif && x.peutSuivre && !ouvert ? (
          <Button type="button" size="sm" onClick={() => setOuvert(true)}>
            {t("Mettre à jour")}
          </Button>
        ) : null}
        {x.peutGerer && x.statut !== "ANNULEE" && peutSeRenouveler(x.horizon) ? (
          <Button type="button" size="sm" variant="ghost" disabled={enCours} onClick={() => basculerReconduction(!x.reconduction)}>
            <Repeat2 data-icon="inline-start" aria-hidden />
            {x.reconduction ? t("Arrêter le renouvellement") : t("Renouveler automatiquement")}
          </Button>
        ) : null}
        {x.peutGerer && actif ? (
          <Button type="button" size="sm" variant="ghost" disabled={enCours} onClick={() => gerer("ANNULER")}>
            <Ban data-icon="inline-start" aria-hidden />
            {t("Annuler la mission")}
          </Button>
        ) : null}
        {x.peutGerer && !actif && x.statut !== "CLOTUREE" ? (
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
            className="ml-auto text-muted-foreground hover:text-destructive"
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

const TITRE_FILTRE: Record<HorizonMission, string> = { HEBDOMADAIRE: m("Semaine"), MENSUELLE: m("Mois"), LONGUE_DUREE: m("Longue durée"), PERMANENTE: m("Permanentes") };

/** Retard d'abord, puis l'échéance la plus proche ; les missions sans fin (permanentes) ferment la marche. */
function parUrgence(a: MissionAffichee, b: MissionAffichee): number {
  const retard = Number(b.etat === "EN_RETARD") - Number(a.etat === "EN_RETARD");
  if (retard !== 0) return retard;
  return (a.dateFin ?? "9999-12-31").localeCompare(b.dateFin ?? "9999-12-31");
}

/** Missions en cartes, filtrables par durée (semaine, mois, longue durée, permanentes). Les missions closes ou annulées sont repliées en dessous. */
export function ListeMissions({ missions, afficherPersonne = false, vide }: { missions: MissionAffichee[]; afficherPersonne?: boolean; vide?: string }) {
  const t = useT();
  const [filtre, setFiltre] = useState<HorizonMission | "TOUTES">("TOUTES");
  const actives = missions.filter((x) => x.statut === "EN_COURS");
  const closes = missions.filter((x) => x.statut !== "EN_COURS");
  const visibles = actives.filter((x) => filtre === "TOUTES" || x.horizon === filtre).sort(parUrgence);
  const compte = (h: HorizonMission) => actives.filter((x) => x.horizon === h).length;

  if (missions.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border px-4 py-8 text-center">
        <span className="flex size-11 items-center justify-center rounded-full bg-marque-bleu-100 text-marque-bleu-800 dark:bg-marque-bleu-800 dark:text-marque-bleu-50">
          <Target className="size-5" aria-hidden />
        </span>
        <p className="max-w-sm text-sm text-muted-foreground">{vide ?? t("Aucune mission pour l'instant.")}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {actives.length > 0 ? (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("Filtrer par durée")}>
          {(["TOUTES", ...HORIZONS] as const).map((h) => {
            const n = h === "TOUTES" ? actives.length : compte(h);
            if (h !== "TOUTES" && n === 0) return null;
            const actif = filtre === h;
            return (
              <button
                key={h}
                type="button"
                aria-pressed={actif}
                onClick={() => setFiltre(h)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium transition-colors ${actif ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:border-primary/50"}`}
              >
                {h === "TOUTES" ? t("Toutes") : t(TITRE_FILTRE[h])}
                <span className={`rounded-full px-1.5 text-xs tabular-nums ${actif ? "bg-primary-foreground/20" : "bg-muted"}`}>{n}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{t("Aucune mission en cours.")}</p>
      )}

      {visibles.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {visibles.map((x) => (
            <CarteMission key={x.id} mission={x} afficherPersonne={afficherPersonne} />
          ))}
        </ul>
      ) : null}

      {closes.length > 0 ? (
        <details className="group rounded-2xl border border-border">
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium select-none">{t("Missions passées ({n})", { n: String(closes.length) })}</summary>
          <ul className="flex flex-col gap-3 border-t border-border p-3">
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
const COURT_HORIZON: Record<HorizonMission, string> = { HEBDOMADAIRE: m("7 jours"), MENSUELLE: m("1 mois"), LONGUE_DUREE: m("Date de fin libre"), PERMANENTE: m("Sans fin") };

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
      <div className="flex flex-col gap-2">
        <Button type="button" size="sm" className="self-start" onClick={() => setOuvert(true)}>
          <Plus data-icon="inline-start" aria-hidden />
          {t("Confier une mission")}
        </Button>
        {etat?.message ? <p role="status" className="text-sm text-emerald-700 dark:text-emerald-300">{etat.message}</p> : null}
      </div>
    );
  }

  return (
    <form ref={formulaire} action={action} className="flex animate-in flex-col gap-4 rounded-2xl border border-border bg-card p-4 shadow-xs duration-300 fade-in slide-in-from-top-1">
      {personneFixeId ? (
        <input type="hidden" name="utilisateurId" value={personneFixeId} />
      ) : (
        <div className="flex flex-col gap-1 sm:max-w-72">
          <Label htmlFor="mission-personne">{t("Confier à")}</Label>
          <select id="mission-personne" name="utilisateurId" required defaultValue="" className="h-9 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50">
            <option value="" disabled>
              {t("Choisir une personne")}
            </option>
            {personnes.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nom}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="flex flex-col gap-1">
        <Label htmlFor="mission-titre">{t("Mission")}</Label>
        <Input id="mission-titre" name="titre" required minLength={3} maxLength={120} placeholder={t("Ex. : signer 5 nouveaux clients")} />
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">{t("Durée")}</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {HORIZONS.map((h) => {
            const Icone = ICONE_HORIZON[h];
            return (
              <label key={h} className={`flex cursor-pointer flex-col items-center gap-1 rounded-xl border px-2 py-3 text-center transition-all has-focus-visible:ring-3 has-focus-visible:ring-ring/50 ${horizon === h ? "border-primary bg-marque-bleu-50 shadow-xs dark:bg-marque-bleu-800/30" : "border-border hover:border-primary/40"}`}>
                <input type="radio" name="horizon" value={h} checked={horizon === h} onChange={() => setHorizon(h)} className="sr-only" />
                <Icone className={`size-5 ${horizon === h ? "text-primary" : "text-muted-foreground"}`} aria-hidden />
                <span className="text-sm font-medium">{t(LIBELLE_HORIZON[h])}</span>
                <span className="text-xs text-muted-foreground">{t(COURT_HORIZON[h])}</span>
              </label>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">{t(AIDE_HORIZON[horizon])}</p>
      {peutSeRenouveler(horizon) ? (
        <label className="flex w-fit cursor-pointer items-center gap-2 text-sm">
          <input type="checkbox" name="reconduction" defaultChecked className="size-4 accent-primary" />
          {horizon === "HEBDOMADAIRE" ? t("Renouveler automatiquement chaque semaine") : t("Renouveler automatiquement chaque mois")}
        </label>
      ) : null}
      </fieldset>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="mission-debut">{t("Début")}</Label>
          <Input id="mission-debut" name="dateDebut" type="date" required defaultValue={aujourdhui} />
        </div>
        {horizon === "LONGUE_DUREE" ? (
          <div className="flex animate-in flex-col gap-1 duration-300 fade-in">
            <Label htmlFor="mission-fin">{t("Fin")}</Label>
            <Input id="mission-fin" name="dateFin" type="date" required />
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="mission-resultat">{t("Résultat attendu (optionnel)")}</Label>
        <Input id="mission-resultat" name="resultatAttendu" maxLength={300} placeholder={t("Ex. : 5 contrats signés avant la fin du mois")} />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="mission-description">{t("Détail (optionnel)")}</Label>
        <Textarea id="mission-description" name="description" rows={3} maxLength={600} />
      </div>

      {etat?.erreur ? <p role="alert" className="text-sm text-destructive">{etat.erreur}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={enCours}>
          {enCours ? <Spinner /> : null}
          {t("Confier la mission")}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOuvert(false)}>
          {t("Annuler")}
        </Button>
      </div>
    </form>
  );
}
