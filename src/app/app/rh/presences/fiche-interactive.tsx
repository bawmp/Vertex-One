"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Check, CheckCheck, ChevronLeft, ChevronRight, Clock, Lock, LockOpen, MessageSquare, Palmtree, Printer, Search, UserCheck, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { enregistrerPresenceAction, marquerTousPresentsAction, rouvrirFicheAction, validerFicheAction } from "@/lib/actions/presences";
import { estEnRetard, isoDuJour, statutEffectif, totauxDe, type DroitFiche, type LignePresence, type SectionPresence, type StatutPresence } from "@/lib/rh/presences-commun";

type FicheClient = {
  date: string;
  droit: DroitFiche;
  gerantNom: string | null;
  valideePar: string | null;
  valideeLe: string | null;
  modifiable: boolean;
  sections: SectionPresence[];
};

const STATUTS: { valeur: StatutPresence; libelle: string; Icone: typeof Check; actif: string; inactif: string }[] = [
  { valeur: "PRESENT", libelle: "Présent", Icone: UserCheck, actif: "bg-emerald-600 text-white ring-emerald-600", inactif: "text-emerald-700 ring-emerald-200 hover:bg-emerald-50" },
  { valeur: "RETARD", libelle: "Retard", Icone: Clock, actif: "bg-amber-500 text-white ring-amber-500", inactif: "text-amber-700 ring-amber-200 hover:bg-amber-50" },
  { valeur: "ABSENT", libelle: "Absent", Icone: UserX, actif: "bg-red-600 text-white ring-red-600", inactif: "text-red-700 ring-red-200 hover:bg-red-50" },
  { valeur: "CONGE", libelle: "Congé", Icone: Palmtree, actif: "bg-sky-600 text-white ring-sky-600", inactif: "text-sky-700 ring-sky-200 hover:bg-sky-50" },
];

type Filtre = "TOUS" | "A_RENSEIGNER" | StatutPresence;

const dateLongue = (iso: string) => new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(`${iso}T00:00:00`));
const decaler = (iso: string, jours: number) => {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + jours);
  return isoDuJour(d);
};
const initiales = (nom: string) => nom.replace(/^TEST\s+/i, "").split(/\s+/).filter(Boolean).slice(0, 2).map((m) => m[0]?.toUpperCase()).join("");
const maintenantHHmm = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

export function FicheInteractive({ fiche }: { fiche: FicheClient }) {
  const router = useRouter();
  const [sections, setSections] = useState<SectionPresence[]>(fiche.sections);
  const [filtre, setFiltre] = useState<Filtre>("TOUS");
  const [recherche, setRecherche] = useState("");
  const [enregistrement, setEnregistrement] = useState<Record<string, "encours" | "ok" | "erreur">>({});
  const [erreurs, setErreurs] = useState<Record<string, string>>({});
  const [remarquesOuvertes, setRemarquesOuvertes] = useState<Record<string, boolean>>({});
  const [message, setMessage] = useState<{ type: "ok" | "erreur"; texte: string } | null>(null);
  const [attente, demarrer] = useTransition();
  const minuteries = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const aujourdhui = isoDuJour(new Date());
  const editable = fiche.modifiable;

  // Après une navigation (autre jour) ou une validation, la page serveur renvoie une nouvelle fiche : on repart de ses données.
  useEffect(() => setSections(fiche.sections), [fiche]);
  useEffect(() => () => Object.values(minuteries.current).forEach(clearTimeout), []);

  const totaux = useMemo(() => totauxDe(sections), [sections]);
  const cle = (entrepriseId: string, l: LignePresence) => `${entrepriseId}:${l.dossierRHId}`;

  const majLigne = useCallback((entrepriseId: string, dossierRHId: string, patch: Partial<LignePresence>) => {
    setSections((avant) => avant.map((s) => (s.entrepriseId !== entrepriseId ? s : { ...s, lignes: s.lignes.map((l) => (l.dossierRHId === dossierRHId ? { ...l, ...patch } : l)) })));
  }, []);

  const enregistrer = useCallback(
    (entrepriseId: string, l: LignePresence, patch: { statut: StatutPresence; heureArrivee: string | null; heureDepart: string | null; remarque: string | null }) => {
      const k = `${entrepriseId}:${l.dossierRHId}`;
      setEnregistrement((e) => ({ ...e, [k]: "encours" }));
      setErreurs((e) => ({ ...e, [k]: "" }));
      void enregistrerPresenceAction({ entrepriseId, dossierRHId: l.dossierRHId, date: fiche.date, ...patch }).then((r) => {
        if (r.erreur) {
          setEnregistrement((e) => ({ ...e, [k]: "erreur" }));
          setErreurs((e) => ({ ...e, [k]: r.erreur ?? "Enregistrement impossible." }));
        } else {
          setEnregistrement((e) => ({ ...e, [k]: "ok" }));
        }
      });
    },
    [fiche.date]
  );

  function choisirStatut(entrepriseId: string, l: LignePresence, statut: StatutPresence) {
    const sansHeures = statut === "ABSENT" || statut === "CONGE";
    const patch = { statut, heureArrivee: sansHeures ? null : l.heureArrivee, heureDepart: sansHeures ? null : l.heureDepart, remarque: l.remarque };
    majLigne(entrepriseId, l.dossierRHId, patch);
    enregistrer(entrepriseId, l, patch);
  }

  /** Saisie d'une heure : enregistrée après une courte pause ; saisir une arrivée sur une ligne vide la marque présente (ou en retard si le shift le dit). */
  function changerHeure(entrepriseId: string, l: LignePresence, champ: "heureArrivee" | "heureDepart", valeur: string) {
    const courante = l.statut ?? "PRESENT";
    let statut: StatutPresence = courante === "ABSENT" || courante === "CONGE" ? "PRESENT" : courante;
    if (champ === "heureArrivee" && valeur && l.statut === null) statut = estEnRetard(l.shiftDebut, l.shiftTolerance, valeur) ? "RETARD" : "PRESENT";
    const patch = { statut, heureArrivee: champ === "heureArrivee" ? valeur || null : l.heureArrivee, heureDepart: champ === "heureDepart" ? valeur || null : l.heureDepart, remarque: l.remarque };
    majLigne(entrepriseId, l.dossierRHId, patch);
    const k = `${entrepriseId}:${l.dossierRHId}:${champ}`;
    clearTimeout(minuteries.current[k]);
    minuteries.current[k] = setTimeout(() => enregistrer(entrepriseId, { ...l, ...patch }, patch), 700);
  }

  function changerRemarque(entrepriseId: string, l: LignePresence) {
    if (!l.statut) return;
    enregistrer(entrepriseId, l, { statut: l.statut, heureArrivee: l.heureArrivee, heureDepart: l.heureDepart, remarque: l.remarque });
  }

  function action(f: () => Promise<{ erreur?: string; nombre?: number }>, succes: (n?: number) => string) {
    setMessage(null);
    demarrer(async () => {
      const r = await f();
      if (r.erreur) setMessage({ type: "erreur", texte: r.erreur });
      else {
        setMessage({ type: "ok", texte: succes(r.nombre) });
        router.refresh();
      }
    });
  }

  const visible = (l: LignePresence) => {
    const st = statutEffectif(l);
    if (filtre === "A_RENSEIGNER" && st !== null) return false;
    if (filtre !== "TOUS" && filtre !== "A_RENSEIGNER" && st !== filtre) return false;
    return !recherche.trim() || `${l.nom} ${l.poste} ${l.service ?? ""}`.toLowerCase().includes(recherche.trim().toLowerCase());
  };

  const cartes: { id: Filtre; libelle: string; valeur: number; couleur: string }[] = [
    { id: "TOUS", libelle: "Effectif", valeur: totaux.total, couleur: "text-foreground" },
    { id: "PRESENT", libelle: "Présents", valeur: totaux.presents, couleur: "text-emerald-600" },
    { id: "RETARD", libelle: "Retards", valeur: totaux.retards, couleur: "text-amber-600" },
    { id: "ABSENT", libelle: "Absents", valeur: totaux.absents, couleur: "text-red-600" },
    { id: "CONGE", libelle: "Congés", valeur: totaux.conges, couleur: "text-sky-600" },
    { id: "A_RENSEIGNER", libelle: "À renseigner", valeur: totaux.nonRenseignes, couleur: "text-muted-foreground" },
  ];

  return (
    <div className="flex flex-col gap-5">
      {/* Navigation de jour */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card p-3 shadow-sm">
        <div className="flex items-center gap-1.5">
          <Button type="button" variant="outline" size="icon" aria-label="Jour précédent" onClick={() => router.push(`/app/rh/presences?date=${decaler(fiche.date, -1)}`)}>
            <ChevronLeft className="size-4" aria-hidden />
          </Button>
          <Input type="date" value={fiche.date} max={aujourdhui} onChange={(e) => e.target.value && router.push(`/app/rh/presences?date=${e.target.value}`)} className="w-40" aria-label="Choisir un jour" />
          <Button type="button" variant="outline" size="icon" aria-label="Jour suivant" disabled={fiche.date >= aujourdhui} onClick={() => router.push(`/app/rh/presences?date=${decaler(fiche.date, 1)}`)}>
            <ChevronRight className="size-4" aria-hidden />
          </Button>
          {fiche.date !== aujourdhui ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => router.push("/app/rh/presences")}>
              Aujourd&apos;hui
            </Button>
          ) : null}
        </div>
        <div className="text-right">
          <p className="text-base font-semibold capitalize">{dateLongue(fiche.date)}</p>
          <p className="text-xs text-muted-foreground">{fiche.gerantNom ? `Gérant : ${fiche.gerantNom}` : "Aucun gérant désigné"}</p>
        </div>
      </div>

      {fiche.valideePar ? (
        <p className="flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800 ring-1 ring-emerald-200">
          <Lock className="size-4 shrink-0" aria-hidden />
          Fiche validée par {fiche.valideePar}
          {fiche.valideeLe ? ` le ${new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(fiche.valideeLe))}` : ""}.{" "}
          {fiche.droit === "ADMIN" ? "Vous pouvez la modifier ou la rouvrir." : "Seul l'Administrateur peut la rouvrir."}
        </p>
      ) : null}
      {!editable && !fiche.valideePar ? <p className="rounded-xl bg-muted p-3 text-sm text-muted-foreground">Cette journée n&apos;est plus modifiable (jour à venir, ou antérieur à 31 jours : l&apos;Administrateur peut la corriger).</p> : null}

      {/* Synthèse (cliquable : filtre la liste) */}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {cartes.map((c) => (
          <button key={c.id} type="button" onClick={() => setFiltre(filtre === c.id ? "TOUS" : c.id)} aria-pressed={filtre === c.id} className={`rounded-xl border p-3 text-left transition hover:shadow-sm ${filtre === c.id ? "border-primary ring-2 ring-primary/20" : "bg-card"}`}>
            <p className={`text-2xl font-bold tabular-nums ${c.couleur}`}>{c.valeur}</p>
            <p className="text-xs text-muted-foreground">{c.libelle}</p>
          </button>
        ))}
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Rechercher un employé…" className="pl-9" aria-label="Rechercher un employé" />
        </div>
        {editable ? (
          <Button type="button" variant="outline" disabled={attente || totaux.nonRenseignes === 0} onClick={() => action(() => marquerTousPresentsAction(fiche.date), (n) => `${n ?? 0} employé(s) marqué(s) présent(s).`)}>
            <CheckCheck data-icon="inline-start" aria-hidden />
            Tous présents ({totaux.nonRenseignes})
          </Button>
        ) : null}
        <a href={`/app/rh/presences/pdf?date=${fiche.date}`} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-lg border bg-background px-3 text-sm font-medium hover:bg-muted">
          <Printer className="size-4" aria-hidden />
          PDF
        </a>
        {!fiche.valideePar && editable ? (
          <Button type="button" disabled={attente} onClick={() => action(() => validerFicheAction(fiche.date), () => "Fiche validée.")}>
            <Lock data-icon="inline-start" aria-hidden />
            Valider la fiche
          </Button>
        ) : null}
        {fiche.valideePar && fiche.droit === "ADMIN" ? (
          <Button type="button" variant="outline" disabled={attente} onClick={() => action(() => rouvrirFicheAction(fiche.date), () => "Fiche rouverte.")}>
            <LockOpen data-icon="inline-start" aria-hidden />
            Rouvrir
          </Button>
        ) : null}
      </div>
      {message ? (
        <p role="status" className={`text-sm font-medium ${message.type === "ok" ? "text-emerald-700" : "text-destructive"}`}>
          {message.texte}
        </p>
      ) : null}

      {/* Lignes */}
      {sections.map((s) => {
        const lignes = s.lignes.filter(visible);
        return (
          <section key={s.entrepriseId} className="flex flex-col gap-2">
            {sections.length > 1 ? (
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                {s.entrepriseNom}
                {!s.propre ? <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-800">Groupe</span> : null}
                <span className="text-xs font-normal text-muted-foreground">{s.lignes.length} employé(s)</span>
              </h2>
            ) : null}
            <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
              <ul className="divide-y">
                {lignes.map((l) => {
                  const k = cle(s.entrepriseId, l);
                  const st = statutEffectif(l);
                  const retardSuggere = l.statut === "PRESENT" && l.heureArrivee && estEnRetard(l.shiftDebut, l.shiftTolerance, l.heureArrivee);
                  const avecHeures = st === "PRESENT" || st === "RETARD";
                  return (
                    <li key={k} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex min-w-0 items-center gap-3 sm:w-64">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">{initiales(l.nom)}</span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">{l.nom.replace(/^TEST\s+/i, "")}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {l.poste}
                            {l.service ? ` · ${l.service}` : ""}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-1 flex-wrap items-center gap-2 sm:justify-end">
                        {l.enCongeApprouve && l.statut === null ? <span className="rounded-full bg-sky-100 px-2.5 py-1 text-xs font-medium text-sky-800">Congé approuvé</span> : null}
                        <div role="group" aria-label={`Statut de ${l.nom}`} className="flex gap-1">
                          {STATUTS.map(({ valeur, libelle, Icone, actif, inactif }) => (
                            <button
                              key={valeur}
                              type="button"
                              disabled={!editable}
                              aria-pressed={st === valeur}
                              onClick={() => choisirStatut(s.entrepriseId, l, valeur)}
                              className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold ring-1 transition disabled:cursor-not-allowed disabled:opacity-60 ${st === valeur ? actif : `bg-background ${inactif}`}`}
                            >
                              <Icone className="size-3.5" aria-hidden />
                              {libelle}
                            </button>
                          ))}
                        </div>

                        {avecHeures ? (
                          <div className="flex items-center gap-1.5">
                            <label className="flex items-center gap-1 text-xs text-muted-foreground">
                              Arrivée
                              <input type="time" value={l.heureArrivee ?? ""} disabled={!editable} onChange={(e) => changerHeure(s.entrepriseId, l, "heureArrivee", e.target.value)} className="h-8 rounded-md border bg-background px-1.5 text-sm text-foreground" />
                            </label>
                            <label className="flex items-center gap-1 text-xs text-muted-foreground">
                              Départ
                              <input type="time" value={l.heureDepart ?? ""} disabled={!editable} onChange={(e) => changerHeure(s.entrepriseId, l, "heureDepart", e.target.value)} className="h-8 rounded-md border bg-background px-1.5 text-sm text-foreground" />
                            </label>
                            {editable && fiche.date === aujourdhui ? (
                              <button type="button" onClick={() => changerHeure(s.entrepriseId, l, l.heureArrivee && !l.heureDepart ? "heureDepart" : "heureArrivee", maintenantHHmm())} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted" title="Mettre l'heure actuelle">
                                <Clock className="size-4" aria-hidden />
                              </button>
                            ) : null}
                          </div>
                        ) : null}

                        <button type="button" onClick={() => setRemarquesOuvertes((o) => ({ ...o, [k]: !o[k] }))} className={`rounded-md p-1.5 hover:bg-muted ${l.remarque ? "text-primary" : "text-muted-foreground"}`} title="Remarque" aria-label={`Remarque pour ${l.nom}`}>
                          <MessageSquare className="size-4" aria-hidden />
                        </button>
                        <span className="w-5 text-center" aria-live="polite">
                          {enregistrement[k] === "encours" ? <span className="inline-block size-3 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" /> : enregistrement[k] === "ok" ? <Check className="size-4 text-emerald-600" aria-label="Enregistré" /> : enregistrement[k] === "erreur" ? <AlertCircle className="size-4 text-destructive" aria-label="Erreur" /> : null}
                        </span>
                      </div>

                      {retardSuggere ? (
                        <p className="w-full text-xs text-amber-700 sm:text-right">
                          Arrivée après {l.shiftDebut} : <button type="button" className="font-semibold underline" onClick={() => choisirStatut(s.entrepriseId, l, "RETARD")}>marquer en retard</button> ?
                        </p>
                      ) : null}
                      {erreurs[k] ? <p className="w-full text-xs text-destructive sm:text-right">{erreurs[k]}</p> : null}
                      {remarquesOuvertes[k] || l.remarque ? (
                        <div className="w-full">
                          <Input
                            value={l.remarque ?? ""}
                            disabled={!editable || !l.statut}
                            placeholder={l.statut ? "Remarque (justification, motif…)" : "Choisissez d'abord un statut"}
                            maxLength={300}
                            onChange={(e) => majLigne(s.entrepriseId, l.dossierRHId, { remarque: e.target.value })}
                            onBlur={() => changerRemarque(s.entrepriseId, l)}
                            className="h-8 text-sm"
                          />
                          {l.saisiPar ? <p className="mt-0.5 text-[11px] text-muted-foreground">Dernière saisie : {l.saisiPar}</p> : null}
                        </div>
                      ) : null}
                    </li>
                  );
                })}
                {lignes.length === 0 ? <li className="px-4 py-6 text-center text-sm text-muted-foreground">{s.lignes.length === 0 ? "Aucun employé sur cette fiche." : "Aucun employé ne correspond à ce filtre."}</li> : null}
              </ul>
            </div>
          </section>
        );
      })}
    </div>
  );
}
