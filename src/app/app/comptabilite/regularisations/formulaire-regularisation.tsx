"use client";

import { useState, useTransition } from "react";
import { CircleCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Champ, ChampSelect } from "@/components/formulaire/champ";
import { ChoixCartes } from "@/components/formulaire/choix-cartes";
import { enregistrerRegularisationAction, type EtatRegularisation } from "@/lib/actions/regularisation";
import { REGULARISATIONS, definitionRegularisation, lignesRegularisation, premierJanvierSuivant, type TypeRegularisation } from "@/lib/comptabilite/regularisations-regles";
import { formaterFCFA } from "@/lib/facturation/calcul";
import { useT } from "@/lib/i18n/contexte";

type Compte = { numero: string; libelle: string; classe: number };

/**
 * Régularisation guidée : on choisit la situation en clair, on saisit le montant, et l'écran montre l'écriture qui sera passée
 * (débit / crédit) avant l'enregistrement. L'extourne au 1er janvier suivant est proposée (cochée) quand elle a du sens.
 * Tous les contrôles sont refaits côté serveur.
 */
export function FormulaireRegularisation({ comptes, dateParDefaut }: { comptes: Compte[]; dateParDefaut: string }) {
  const t = useT();
  const [type, setType] = useState<TypeRegularisation>("CHARGE_A_PAYER");
  const [compte, setCompte] = useState("");
  const [montant, setMontant] = useState("");
  const [date, setDate] = useState(dateParDefaut);
  const [extourne, setExtourne] = useState(true);
  const [etat, setEtat] = useState<EtatRegularisation>(null);
  const [enCours, startTransition] = useTransition();

  const def = definitionRegularisation(type)!;
  const comptesProposes = def.classeCompte ? comptes.filter((c) => c.classe === def.classeCompte) : [];
  const montantNombre = Number(montant.replace(/\s/g, ""));
  const lignes = lignesRegularisation(type, montantNombre, def.classeCompte ? compte || null : null);
  const libelleCompte = (numero: string) => {
    const c = comptes.find((x) => x.numero === numero);
    return c ? `${c.numero} — ${c.libelle}` : numero;
  };
  const dateExtourne = (() => {
    const d = new Date(`${date}T12:00:00+01:00`);
    return Number.isNaN(d.getTime()) ? null : premierJanvierSuivant(d);
  })();

  return (
    <Card>
      <CardContent>
        <form
          className="flex flex-col gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            const donnees = new FormData(e.currentTarget);
            setEtat(null);
            startTransition(async () => {
              const retour = await enregistrerRegularisationAction(null, donnees);
              setEtat(retour);
              if (retour?.message) {
                setMontant("");
                setCompte("");
              }
            });
          }}
        >
          <ChoixCartes
            nom="type"
            etiquette={t("Situation à régulariser")}
            valeur={type}
            onChange={(v) => {
              setType(v as TypeRegularisation);
              setCompte("");
              setExtourne(definitionRegularisation(v)?.extourne ?? false);
            }}
            colonnes={2}
            options={REGULARISATIONS.map((d) => ({ valeur: d.type, libelle: t(d.titre), detail: t(d.explication) }))}
          />

          <div className="grid gap-3 sm:grid-cols-2">
            {def.classeCompte ? (
              <ChampSelect label={def.classeCompte === 6 ? t("Compte de charge concerné") : t("Compte de produit concerné")} name="compte" required value={compte} onChange={(e) => setCompte(e.target.value)} className="sm:col-span-2">
                <option value="" />
                {comptesProposes.map((c) => (
                  <option key={c.numero} value={c.numero}>
                    {c.numero} — {c.libelle}
                  </option>
                ))}
              </ChampSelect>
            ) : null}
            <Champ label={t("Montant (FCFA)")} name="montant" type="number" inputMode="numeric" min={1} step={1} required value={montant} onChange={(e) => setMontant(e.target.value)} />
            <Champ label={t("Date de l'écriture")} name="date" type="date" required value={date} onChange={(e) => setDate(e.target.value)} aide={t("En général le 31 décembre de l'exercice.")} />
            <Champ label={t("Libellé")} name="libelle" required maxLength={120} placeholder={t("Ex. Électricité de décembre")} className="sm:col-span-2" />
          </div>

          {def.extourne ? (
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" name="extourne" value="oui" checked={extourne} onChange={(e) => setExtourne(e.target.checked)} className="mt-1 size-4 accent-primary" />
              <span>
                <strong>{t("Annuler automatiquement cette écriture au 1er janvier suivant")}</strong> ({t("extourne")})
                <span className="block text-muted-foreground">{t("Recommandé : l'année suivante, la vraie facture ou le vrai encaissement s'enregistre normalement, sans doublon.")}</span>
              </span>
            </label>
          ) : (
            <p className="text-sm text-muted-foreground">{t("Une provision reste au bilan : elle n'est pas annulée automatiquement.")}</p>
          )}

          {lignes ? (
            <div className="rounded-lg border bg-muted/30 p-3 text-sm" aria-live="polite">
              <p className="mb-2 font-medium">{t("Écriture qui sera passée")}</p>
              <ul className="flex flex-col gap-1">
                {lignes.map((l) => (
                  <li key={`${l.numero}-${l.debit}`} className="flex justify-between gap-3">
                    <span className="min-w-0 truncate">
                      {l.debit > 0 ? t("Débit") : t("Crédit")} · {libelleCompte(l.numero)}
                    </span>
                    <span className="shrink-0 tabular-nums">{formaterFCFA(l.debit || l.credit)}</span>
                  </li>
                ))}
              </ul>
              {extourne && def.extourne && dateExtourne ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  {t("Puis, le {date}, l'écriture inverse.", { date: new Intl.DateTimeFormat(t.locale, { dateStyle: "long", timeZone: "Africa/Douala" }).format(dateExtourne) })}
                </p>
              ) : null}
            </div>
          ) : null}

          {etat?.erreur ? <p role="alert" className="text-sm text-destructive">{etat.erreur}</p> : null}
          {etat?.message ? (
            <p role="status" className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
              <CircleCheck className="size-4" aria-hidden />
              {etat.message}
            </p>
          ) : null}

          <Button type="submit" disabled={enCours || !lignes || (def.classeCompte !== null && !compte)} className="self-start">
            {enCours ? <Spinner /> : null}
            {t("Enregistrer la régularisation")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
