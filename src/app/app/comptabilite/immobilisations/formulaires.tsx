"use client";

import { useState, useTransition } from "react";
import { CircleCheck, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Champ, ChampSelect } from "@/components/formulaire/champ";
import { ajouterImmobilisationAction, passerDotationsAction, retirerImmobilisationAction, type EtatImmobilisation } from "@/lib/actions/immobilisation";
import { CATEGORIES_IMMOBILISATION, categorieImmobilisation, planAmortissement, exerciceDuBien } from "@/lib/comptabilite/immobilisations-regles";
import { formaterFCFA } from "@/lib/facturation/calcul";
import { useT } from "@/lib/i18n/contexte";

function Retour({ etat }: { etat: EtatImmobilisation }) {
  if (etat?.erreur) return <p role="alert" className="text-sm text-destructive">{etat.erreur}</p>;
  if (!etat?.message) return null;
  return (
    <p role="status" className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
      <CircleCheck className="size-4" aria-hidden />
      {etat.message}
    </p>
  );
}

/** Ajout d'un bien : catégorie (qui fixe la durée conseillée), prix, date ; l'écran montre la dotation annuelle avant d'enregistrer. */
export function FormulaireImmobilisation({ aujourdhui, moisDebut = 1 }: { aujourdhui: string; moisDebut?: number }) {
  const t = useT();
  const [categorie, setCategorie] = useState(CATEGORIES_IMMOBILISATION[0].compteActif);
  const [duree, setDuree] = useState(String(CATEGORIES_IMMOBILISATION[0].dureeConseillee));
  const [valeur, setValeur] = useState("");
  const [residuelle, setResiduelle] = useState("0");
  const [date, setDate] = useState(aujourdhui);
  const [etat, setEtat] = useState<EtatImmobilisation>(null);
  const [enCours, startTransition] = useTransition();

  const d = new Date(`${date}T12:00:00+01:00`);
  const { annee, mois } = Number.isNaN(d.getTime()) ? { annee: 0, mois: 0 } : exerciceDuBien(d, moisDebut);
  const plan = planAmortissement({ valeurAcquisition: Number(valeur), valeurResiduelle: Number(residuelle) || 0, dureeAnnees: Number(duree), anneeAcquisition: annee, moisAcquisition: mois });

  return (
    <Card>
      <CardContent>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            const donnees = new FormData(e.currentTarget);
            setEtat(null);
            startTransition(async () => {
              const retour = await ajouterImmobilisationAction(null, donnees);
              setEtat(retour);
              if (retour?.message) setValeur("");
            });
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Champ label={t("Désignation du bien")} name="libelle" required maxLength={120} placeholder={t("Ex. Ordinateur portable du bureau")} className="sm:col-span-2" />
            <ChampSelect
              label={t("Catégorie")}
              name="categorie"
              value={categorie}
              onChange={(e) => {
                setCategorie(e.target.value);
                setDuree(String(categorieImmobilisation(e.target.value)?.dureeConseillee ?? 5));
              }}
            >
              {CATEGORIES_IMMOBILISATION.map((c) => (
                <option key={c.compteActif} value={c.compteActif}>
                  {t(c.libelle)}
                </option>
              ))}
            </ChampSelect>
            <Champ label={t("Durée d'amortissement (années)")} name="duree" type="number" min={1} max={50} step={1} required value={duree} onChange={(e) => setDuree(e.target.value)} aide={t("Durée conseillée selon la catégorie, modifiable.")} />
            <Champ label={t("Valeur d'acquisition (FCFA)")} name="valeur" type="number" inputMode="numeric" min={1} step={1} required value={valeur} onChange={(e) => setValeur(e.target.value)} />
            <Champ label={t("Valeur résiduelle (FCFA)")} name="residuelle" type="number" inputMode="numeric" min={0} step={1} value={residuelle} onChange={(e) => setResiduelle(e.target.value)} aide={t("Ce que le bien vaudra à la fin, en général 0.")} />
            <Champ label={t("Date d'acquisition")} name="date" type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
            <ChampSelect label={t("L'achat est-il déjà en comptabilité ?")} name="contrepartie" defaultValue="AUCUNE" aide={t("Si non, l'écriture d'acquisition est passée pour vous.")}>
              <option value="AUCUNE">{t("Oui, déjà enregistré (dépense, journal…)")}</option>
              <option value="512000">{t("Non — payé par la banque")}</option>
              <option value="571000">{t("Non — payé en espèces (caisse)")}</option>
              <option value="401000">{t("Non — à payer au fournisseur")}</option>
            </ChampSelect>
          </div>

          {plan.length > 0 ? (
            <div className="rounded-lg border bg-muted/30 p-3 text-sm" aria-live="polite">
              <p className="mb-1 font-medium">{t("Amortissement prévu")}</p>
              <p className="text-muted-foreground">
                {plan.length > 1
                  ? t("{n} dotations : {premiere} en {annee}, puis jusqu'en {derniere}. Dotation pleine : {pleine} par an.", { n: plan.length, premiere: formaterFCFA(plan[0].montant), annee: plan[0].annee, derniere: plan[plan.length - 1].annee, pleine: formaterFCFA(plan[1].montant) })
                  : t("{n} dotation : {premiere} en {annee}. Dotation pleine : {pleine} par an.", { n: plan.length, premiere: formaterFCFA(plan[0].montant), annee: plan[0].annee, pleine: formaterFCFA(plan[0].montant) })}
              </p>
            </div>
          ) : null}

          <Retour etat={etat} />
          <Button type="submit" disabled={enCours || plan.length === 0} className="self-start">
            {enCours ? <Spinner /> : <Plus data-icon="inline-start" aria-hidden />}
            {t("Ajouter au registre")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

/** « Passer les dotations de l'exercice » : choix de l'année, un clic ; rejouable sans doublon. */
export function FormulaireDotations({ annees, anneeParDefaut }: { annees: number[]; anneeParDefaut: number }) {
  const t = useT();
  const [annee, setAnnee] = useState(String(anneeParDefaut));
  const [etat, setEtat] = useState<EtatImmobilisation>(null);
  const [enCours, startTransition] = useTransition();
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        const donnees = new FormData(e.currentTarget);
        setEtat(null);
        startTransition(async () => setEtat(await passerDotationsAction(null, donnees)));
      }}
    >
      <div className="flex flex-wrap items-end gap-3">
        <ChampSelect label={t("Exercice")} name="annee" value={annee} onChange={(e) => setAnnee(e.target.value)} className="w-40">
          {annees.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </ChampSelect>
        <Button type="submit" disabled={enCours}>
          {enCours ? <Spinner /> : null}
          {t("Passer les dotations de {annee}", { annee })}
        </Button>
      </div>
      <Retour etat={etat} />
    </form>
  );
}

export function BoutonRetirer({ id }: { id: string }) {
  const t = useT();
  const [etat, setEtat] = useState<EtatImmobilisation>(null);
  const [enCours, startTransition] = useTransition();
  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        disabled={enCours}
        aria-label={t("Retirer ce bien du registre")}
        className="text-muted-foreground hover:text-destructive"
        onClick={() => {
          if (!window.confirm(t("Retirer ce bien du registre ?"))) return;
          const donnees = new FormData();
          donnees.set("id", id);
          startTransition(async () => setEtat(await retirerImmobilisationAction(null, donnees)));
        }}
      >
        <Trash2 className="size-4" aria-hidden />
      </Button>
      {etat?.erreur ? <p role="alert" className="max-w-56 text-right text-xs text-destructive">{etat.erreur}</p> : null}
    </div>
  );
}
