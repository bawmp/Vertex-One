"use client";

import { useActionState } from "react";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Champ } from "@/components/formulaire/champ";
import { creerListePrixAction, modifierListePrixAction } from "@/lib/actions/listes-prix";
import { useT } from "@/lib/i18n/contexte";

/** Nom et remise globale d'une liste de prix. Sans `listeId`, crée la liste puis ouvre sa page pour fixer les prix ; avec, la modifie. */
export function FormulaireListe({ listeId, nom, remisePourcent }: { listeId?: string; nom?: string; remisePourcent?: number }) {
  const t = useT();
  const action = listeId ? modifierListePrixAction.bind(null, listeId) : creerListePrixAction;
  const [etat, formAction, enCours] = useActionState(action, null);
  return (
    <form action={formAction} className="flex flex-col gap-3" aria-label={listeId ? t("Modifier la liste") : t("Créer une liste de prix")}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_12rem_auto] sm:items-start">
        <Champ label={t("Nom de la liste")} name="nom" required minLength={2} maxLength={60} defaultValue={nom} placeholder={t("Ex. Revendeurs")} />
        <Champ label={t("Remise sur le catalogue (%)")} name="remisePourcent" type="number" min={0} max={100} step={1} inputMode="numeric" defaultValue={remisePourcent ?? 0} />
        <Button type="submit" disabled={enCours} className="sm:mt-1">
          {enCours ? <Spinner /> : <Save data-icon="inline-start" aria-hidden />}
          {listeId ? t("Enregistrer") : t("Créer la liste")}
        </Button>
      </div>
      {etat?.erreur ? <p role="alert" className="text-sm text-destructive">{etat.erreur}</p> : null}
      {etat?.message ? <p role="status" className="text-sm text-emerald-700 dark:text-emerald-400">{etat.message}</p> : null}
    </form>
  );
}
