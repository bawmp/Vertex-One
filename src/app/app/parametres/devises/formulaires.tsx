"use client";

import { useState, useTransition } from "react";
import { CircleCheck, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Champ } from "@/components/formulaire/champ";
import { enregistrerTauxChange, supprimerTauxChange, type EtatDevises } from "@/lib/actions/devises";
import { convertirDepuisXaf, convertirVersXaf, formaterMontantDevise } from "@/lib/devises/regles";
import { useT } from "@/lib/i18n/contexte";

function Retour({ etat }: { etat: EtatDevises }) {
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

/** Nouveau taux : devise sur trois lettres, FCFA pour une unité, date d'effet. Le même couple devise + date est corrigé, pas doublé. */
export function FormulaireTaux({ aujourdhui }: { aujourdhui: string }) {
  const t = useT();
  const [etat, setEtat] = useState<EtatDevises>(null);
  const [enCours, startTransition] = useTransition();
  return (
    <form
      className="flex flex-col gap-3 rounded-lg border p-4"
      aria-label={t("Nouveau taux de change")}
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const donnees = new FormData(form);
        setEtat(null);
        startTransition(async () => {
          const r = await enregistrerTauxChange(null, donnees);
          setEtat(r);
          if (r?.message) form.reset();
        });
      }}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Champ label={t("Devise (EUR, USD…)")} name="devise" required maxLength={3} />
        <Champ label={t("FCFA pour une unité")} name="taux" required inputMode="decimal" placeholder="655,957" />
        <Champ label={t("En vigueur depuis le")} name="dateEffet" type="date" defaultValue={aujourdhui} required />
      </div>
      <Button type="submit" className="self-start" disabled={enCours}>
        {enCours ? <Spinner /> : <Plus data-icon="inline-start" aria-hidden />}
        {t("Enregistrer le taux")}
      </Button>
      <Retour etat={etat} />
    </form>
  );
}

export function BoutonSupprimerTaux({ id, devise }: { id: string; devise: string }) {
  const t = useT();
  const [etat, setEtat] = useState<EtatDevises>(null);
  const [enCours, startTransition] = useTransition();
  return (
    <span className="flex items-center gap-2">
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={t("Supprimer le taux {devise}", { devise })}
        className="text-muted-foreground hover:text-destructive"
        disabled={enCours}
        onClick={() => {
          if (!window.confirm(t("Supprimer ce taux ?"))) return;
          startTransition(async () => setEtat(await supprimerTauxChange(id)));
        }}
      >
        <Trash2 className="size-4" aria-hidden />
      </Button>
      {etat?.erreur ? <span role="alert" className="text-xs text-destructive">{etat.erreur}</span> : null}
    </span>
  );
}

/** Convertisseur : un montant en FCFA ou dans la devise choisie, au taux en vigueur aujourd'hui. Calcul local, rien n'est enregistré. */
export function Convertisseur({ taux }: { taux: { devise: string; tauxMilliemes: number }[] }) {
  const t = useT();
  const [devise, setDevise] = useState(taux[0]?.devise ?? "");
  const [sens, setSens] = useState<"VERS_DEVISE" | "VERS_XAF">("VERS_DEVISE");
  const [saisie, setSaisie] = useState("");
  const courant = taux.find((x) => x.devise === devise);
  const propre = saisie.trim().replace(/\s/g, "").replace(",", ".");
  const valeur = /^\d+(\.\d{1,2})?$/.test(propre) ? Number(propre) : null;
  let resultat = "";
  if (courant && valeur !== null && Number.isFinite(valeur)) {
    resultat = sens === "VERS_DEVISE" ? formaterMontantDevise(convertirDepuisXaf(valeur, courant.tauxMilliemes), courant.devise, t.locale) : `${new Intl.NumberFormat(t.locale).format(convertirVersXaf(valeur, courant.tauxMilliemes))} FCFA`;
  }
  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-sm">
          {t("Devise")}
          <select value={devise} onChange={(e) => setDevise(e.target.value)} className="h-10 rounded-lg border border-input bg-background px-3 text-sm">
            {taux.map((x) => (
              <option key={x.devise} value={x.devise}>
                {x.devise}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {t("Sens")}
          <select value={sens} onChange={(e) => setSens(e.target.value as "VERS_DEVISE" | "VERS_XAF")} className="h-10 rounded-lg border border-input bg-background px-3 text-sm">
            <option value="VERS_DEVISE">{t("FCFA vers la devise")}</option>
            <option value="VERS_XAF">{t("Devise vers FCFA")}</option>
          </select>
        </label>
        <Champ label={t("Montant")} name="montant" inputMode="decimal" value={saisie} onChange={(e) => setSaisie(e.target.value)} />
      </div>
      <p className="text-sm" aria-live="polite">
        {resultat ? <span className="text-lg font-medium tabular-nums">= {resultat}</span> : <span className="text-muted-foreground">{t("Saisissez un montant.")}</span>}
      </p>
    </div>
  );
}
