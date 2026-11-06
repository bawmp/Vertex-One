"use client";

import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useT } from "@/lib/i18n/contexte";
import { m } from "@/lib/i18n/catalogue";
import type { ChoixAssignation, RegleAssignation } from "@/lib/api-externe/assignation-regle";

export type MembreAssignable = { id: string; nom: string; role: string };

const LIBELLE_ROLE: Record<string, string> = { ADMIN: m("Administrateur"), MANAGER: m("Manager"), EMPLOYE: m("Employé"), COMPTABLE: m("Comptable") };

/**
 * Choisit à qui vont les prospects reçus par une clé d'API ou une page Facebook : le premier administrateur (par défaut), une personne (un Manager),
 * ou un tour de rôle entre plusieurs. La liste des personnes vient du serveur (membres actifs avec accès au CRM) ; le serveur revérifie tout à
 * l'enregistrement, ce composant ne fait confiance à rien.
 */
export function ChoixAssignationProspects({
  membres,
  valeur,
  enregistrer,
}: {
  membres: MembreAssignable[];
  valeur: RegleAssignation | null;
  enregistrer: (choix: ChoixAssignation) => Promise<{ erreur?: string }>;
}) {
  const t = useT();
  const [mode, setMode] = useState<ChoixAssignation["mode"]>(valeur?.mode ?? "ADMIN");
  const [personne, setPersonne] = useState(valeur?.mode === "PERSONNE" ? valeur.utilisateurId : (membres[0]?.id ?? ""));
  const [groupe, setGroupe] = useState<string[]>(valeur?.mode === "REPARTITION" ? valeur.utilisateurIds : []);
  const [erreur, setErreur] = useState<string | null>(null);
  const [fait, setFait] = useState(false);
  const [enCours, demarrer] = useTransition();

  const basculer = (id: string) => setGroupe((g) => (g.includes(id) ? g.filter((x) => x !== id) : [...g, id]));
  const valide = mode === "ADMIN" || (mode === "PERSONNE" && !!personne) || (mode === "REPARTITION" && groupe.length >= 2);

  function sauvegarder() {
    setErreur(null);
    setFait(false);
    const choix: ChoixAssignation = mode === "ADMIN" ? { mode: "ADMIN" } : mode === "PERSONNE" ? { mode: "PERSONNE", utilisateurId: personne } : { mode: "REPARTITION", utilisateurIds: groupe };
    demarrer(async () => {
      const r = await enregistrer(choix);
      if (r.erreur) setErreur(r.erreur);
      else setFait(true);
    });
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg bg-muted/40 p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">{t("Les prospects vont à")}</span>
          <select
            value={mode}
            onChange={(e) => {
              setMode(e.target.value as ChoixAssignation["mode"]);
              setFait(false);
            }}
            className="h-8 rounded-lg border border-input bg-background px-2 text-sm"
          >
            <option value="ADMIN">{t("Le premier administrateur")}</option>
            <option value="PERSONNE" disabled={membres.length === 0}>{t("Une personne")}</option>
            <option value="REPARTITION" disabled={membres.length < 2}>{t("Un tour de rôle entre plusieurs personnes")}</option>
          </select>
        </label>

        {mode === "PERSONNE" ? (
          <select
            value={personne}
            onChange={(e) => {
              setPersonne(e.target.value);
              setFait(false);
            }}
            aria-label={t("Personne qui reçoit les prospects")}
            className="h-8 rounded-lg border border-input bg-background px-2 text-sm"
          >
            {membres.map((membre) => (
              <option key={membre.id} value={membre.id}>
                {membre.nom} ({t(LIBELLE_ROLE[membre.role] ?? membre.role)})
              </option>
            ))}
          </select>
        ) : null}
      </div>

      {mode === "REPARTITION" ? (
        <fieldset className="flex flex-col gap-1">
          <legend className="text-xs text-muted-foreground">{t("Choisissez au moins deux personnes : chaque nouveau prospect va à celle qui en a reçu le moins ces 30 derniers jours.")}</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {membres.map((membre) => (
              <label key={membre.id} className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={groupe.includes(membre.id)}
                  onChange={() => {
                    basculer(membre.id);
                    setFait(false);
                  }}
                  className="size-4 accent-primary"
                />
                {membre.nom}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="outline" disabled={!valide || enCours} onClick={sauvegarder}>
          {enCours ? <Spinner data-icon="inline-start" /> : null}
          {t("Enregistrer")}
        </Button>
        {fait ? (
          <span role="status" className="flex items-center gap-1 text-xs text-emerald-700">
            <Check className="size-3.5" aria-hidden />
            {t("Enregistré")}
          </span>
        ) : null}
        {erreur ? (
          <span role="alert" className="text-xs text-destructive">
            {erreur}
          </span>
        ) : null}
      </div>
    </div>
  );
}
