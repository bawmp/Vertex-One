"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { definirSequenceProspects } from "@/lib/actions/prospect";
import { useT } from "@/lib/i18n/contexte";

/** Réglages de la relance automatique : activer, délais (en jours après la qualification), plafond d'e-mails automatiques par jour. */
export function FormulaireSequence({ actifInitial, delaisInitiaux, plafondInitial }: { actifInitial: boolean; delaisInitiaux: string; plafondInitial: number }) {
  const t = useT();
  const [actif, setActif] = useState(actifInitial);
  const [delais, setDelais] = useState(delaisInitiaux.split(",").join(", "));
  const [plafond, setPlafond] = useState(String(plafondInitial));
  const [erreur, setErreur] = useState<string | null>(null);
  const [fait, setFait] = useState(false);
  const [enCours, demarrer] = useTransition();

  function enregistrer() {
    setErreur(null);
    setFait(false);
    demarrer(async () => {
      const r = await definirSequenceProspects({ active: actif, delais, plafond: Number(plafond) });
      if (r.erreur) setErreur(r.erreur);
      else setFait(true);
    });
  }

  return (
    <div className="flex max-w-xl flex-col gap-4">
      <label className="flex w-fit cursor-pointer items-center gap-2.5 text-sm font-medium">
        <input type="checkbox" checked={actif} onChange={(e) => setActif(e.target.checked)} className="size-4 accent-primary" />
        {t("Activer la relance automatique des prospects qualifiés")}
      </label>

      <div className="flex flex-col gap-1">
        <Label htmlFor="delais-sequence">{t("Jours d'envoi après la qualification")}</Label>
        <Input id="delais-sequence" value={delais} onChange={(e) => setDelais(e.target.value)} className="max-w-48" inputMode="numeric" />
        <span className="text-xs text-muted-foreground">
          {t("De 1 à 3 nombres croissants. « 3, 7, 14 » : un e-mail 3 jours après la qualification, le suivant 4 jours plus tard (J+7), puis 7 jours plus tard (J+14).")}
        </span>
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="plafond-sequence">{t("Plafond d'e-mails automatiques par jour")}</Label>
        <Input id="plafond-sequence" type="number" min={1} max={200} value={plafond} onChange={(e) => setPlafond(e.target.value)} className="max-w-32" />
        <span className="text-xs text-muted-foreground">{t("Au-delà, les envois restants attendent le lendemain (les plus en retard partent d'abord).")}</span>
      </div>

      {erreur ? (
        <p role="alert" className="flex items-start gap-1.5 text-sm text-destructive">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {erreur}
        </p>
      ) : null}
      {fait ? (
        <p role="status" className="flex items-center gap-1.5 text-sm text-emerald-700 dark:text-emerald-300">
          <CheckCircle2 className="size-4" aria-hidden />
          {t("Réglages enregistrés.")}
        </p>
      ) : null}
      <div>
        <Button type="button" onClick={enregistrer} disabled={enCours}>
          {enCours ? <Spinner /> : null}
          {t("Enregistrer")}
        </Button>
      </div>
    </div>
  );
}
