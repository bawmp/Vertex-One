"use client";

import { useState, useTransition } from "react";
import { CircleCheck, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Champ, ChampSelect } from "@/components/formulaire/champ";
import { affecterDocumentAnalytique, creerSectionAnalytique, modifierSectionAnalytique, type EtatAnalytique } from "@/lib/actions/analytique";
import { AXES, LIBELLES_AXE } from "@/lib/comptabilite/analytique-regles";
import { useT } from "@/lib/i18n/contexte";

function Retour({ etat }: { etat: EtatAnalytique }) {
  if (etat?.erreur) return <p role="alert" className="text-sm text-destructive">{etat.erreur}</p>;
  if (etat?.message)
    return (
      <p role="status" className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
        <CircleCheck className="size-4" aria-hidden />
        {etat.message}
      </p>
    );
  return null;
}

/** Nouvelle section : un axe (projet, agence, autre), un code court et un nom. */
export function FormulaireSection() {
  const t = useT();
  const [etat, setEtat] = useState<EtatAnalytique>(null);
  const [enCours, startTransition] = useTransition();
  return (
    <form
      className="flex flex-col gap-3 rounded-lg border p-4"
      aria-label={t("Nouvelle section analytique")}
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const donnees = new FormData(form);
        setEtat(null);
        startTransition(async () => {
          const r = await creerSectionAnalytique(null, donnees);
          setEtat(r);
          if (r?.message) form.reset();
        });
      }}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <ChampSelect label={t("Axe")} name="axe" defaultValue="PROJET">
          {AXES.map((a) => (
            <option key={a} value={a}>
              {t(LIBELLES_AXE[a])}
            </option>
          ))}
        </ChampSelect>
        <Champ label={t("Code")} name="code" required maxLength={20} />
        <Champ label={t("Nom")} name="libelle" required maxLength={80} />
      </div>
      <Button type="submit" className="self-start" disabled={enCours}>
        {enCours ? <Spinner /> : <Plus data-icon="inline-start" aria-hidden />}
        {t("Ajouter la section")}
      </Button>
      <Retour etat={etat} />
    </form>
  );
}

/** Active ou désactive une section (jamais supprimée : ses écritures restent lisibles). */
export function BasculeSection({ id, libelle, actif }: { id: string; libelle: string; actif: boolean }) {
  const t = useT();
  const [etat, setEtat] = useState<EtatAnalytique>(null);
  const [enCours, startTransition] = useTransition();
  return (
    <span className="flex items-center gap-2">
      <Button type="button" variant="ghost" size="sm" disabled={enCours} onClick={() => startTransition(async () => setEtat(await modifierSectionAnalytique(id, libelle, !actif)))}>
        {actif ? t("Désactiver") : t("Réactiver")}
      </Button>
      {etat?.erreur ? <span role="alert" className="text-xs text-destructive">{etat.erreur}</span> : null}
    </span>
  );
}

/** Rattache un document (facture, dépense) à une section : ses écritures, règlements compris, suivent. */
export function SelecteurSection({ type, documentId, courante, sections }: { type: "FACTURE" | "DEPENSE" | "FACTURE_FOURNISSEUR"; documentId: string; courante: string; sections: { id: string; libelle: string; code: string }[] }) {
  const t = useT();
  const [etat, setEtat] = useState<EtatAnalytique>(null);
  const [enCours, startTransition] = useTransition();
  return (
    <div className="flex w-full min-w-0 flex-col gap-1 sm:w-auto sm:max-w-[60%]">
      <select
        aria-label={t("Section analytique")}
        defaultValue={courante}
        disabled={enCours}
        className="h-9 w-full min-w-0 rounded-lg border border-input bg-background px-2 text-sm"
        onChange={(e) => {
          const v = e.target.value;
          setEtat(null);
          startTransition(async () => setEtat(await affecterDocumentAnalytique(type, documentId, v || null)));
        }}
      >
        <option value="">{t("Non affecté")}</option>
        {sections.map((s) => (
          <option key={s.id} value={s.id}>
            {s.code} — {s.libelle}
          </option>
        ))}
      </select>
      <Retour etat={etat} />
    </div>
  );
}
