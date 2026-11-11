"use client";

import { useActionState, useEffect, useState } from "react";
import { Pencil, Send, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { envoyerBulletin, modifierBulletin } from "@/lib/actions/paie";
import { MODES_PAIEMENT, NB_MAX_RETENUES } from "@/lib/rh/paie-regles";
import { useT } from "@/lib/i18n/contexte";

/**
 * Actions de l'Administrateur sur un bulletin : tant qu'il est un brouillon, le corriger (date, mode, retenues) puis l'envoyer à la personne ;
 * une fois envoyé il est figé (on peut seulement le renvoyer).
 */
export function ActionsBulletin({ paiementId, envoye, datePaiement, modePaiement, retenues }: { paiementId: string; envoye: boolean; datePaiement: string; modePaiement: string; retenues: { libelle: string; montant: number }[] }) {
  const t = useT();
  const [etatModif, actionModif, enCoursModif] = useActionState(modifierBulletin, null);
  const [etatEnvoi, actionEnvoi, enCoursEnvoi] = useActionState(envoyerBulletin, null);
  const [edition, setEdition] = useState(false);

  useEffect(() => {
    // Modification enregistrée : le formulaire se referme (la liste se met à jour toute seule).
    /* eslint-disable react-hooks/set-state-in-effect -- réaction à la réponse du serveur */
    if (etatModif?.ok) setEdition(false);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [etatModif]);

  const boutonEnvoi = (
    <form action={actionEnvoi}>
      <input type="hidden" name="paiementId" value={paiementId} />
      <Button type="submit" size="sm" variant={envoye ? "outline" : "default"} disabled={enCoursEnvoi}>
        {enCoursEnvoi ? <Spinner /> : <Send data-icon="inline-start" aria-hidden />}
        {envoye ? t("Renvoyer par email") : t("Envoyer à la personne")}
      </Button>
    </form>
  );

  return (
    <div className="flex w-full flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {!envoye ? (
          <Button type="button" variant="outline" size="sm" onClick={() => setEdition((v) => !v)}>
            <Pencil data-icon="inline-start" aria-hidden />
            {t("Modifier le bulletin")}
          </Button>
        ) : null}
        {boutonEnvoi}
        {etatEnvoi?.ok ? (
          <span role="status" className="flex animate-in items-center gap-1.5 text-xs text-emerald-700 fade-in dark:text-emerald-400">
            <CheckCircle2 className="size-4" aria-hidden />
            {t("Bulletin envoyé par email.")}
          </span>
        ) : null}
        {etatEnvoi?.erreur ? <span role="alert" className="text-xs text-destructive">{etatEnvoi.erreur}</span> : null}
      </div>

      {edition && !envoye ? (
        <form action={actionModif} className="flex animate-in flex-col gap-3 rounded-lg border p-4 fade-in">
          <input type="hidden" name="paiementId" value={paiementId} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`bulletin-date-${paiementId}`}>{t("Date du paiement")}</Label>
              <Input id={`bulletin-date-${paiementId}`} name="datePaiement" type="date" required defaultValue={datePaiement} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`bulletin-mode-${paiementId}`}>{t("Mode de paiement")}</Label>
              <Select id={`bulletin-mode-${paiementId}`} name="modePaiement" required defaultValue={modePaiement}>
                {MODES_PAIEMENT.map((x) => (
                  <option key={x.cle} value={x.cle}>
                    {t(x.libelle)}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium">{t("Retenues (facultatif)")}</legend>
            {Array.from({ length: NB_MAX_RETENUES }, (_, i) => i + 1).map((n) => (
              <div key={n} className="grid grid-cols-[1fr_9rem] gap-2">
                <Input name={`retenueLibelle${n}`} maxLength={80} defaultValue={retenues[n - 1]?.libelle ?? ""} placeholder={t("Nom de la retenue")} aria-label={t("Nom de la retenue {n}", { n })} />
                <Input name={`retenueMontant${n}`} type="number" min={1} step={1} defaultValue={retenues[n - 1]?.montant ?? ""} placeholder={t("FCFA")} aria-label={t("Montant de la retenue {n}", { n })} />
              </div>
            ))}
          </fieldset>
          {etatModif?.erreur ? <p role="alert" className="text-sm text-destructive">{etatModif.erreur}</p> : null}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="sm" disabled={enCoursModif}>
              {enCoursModif ? <Spinner /> : null}
              {enCoursModif ? t("Enregistrement…") : t("Enregistrer les modifications")}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setEdition(false)}>
              {t("Annuler")}
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
