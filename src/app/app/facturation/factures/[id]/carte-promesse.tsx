"use client";

import { useState, useTransition } from "react";
import { CalendarCheck, CalendarClock, History } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { annulerPromesse, noterPromesse } from "@/lib/actions/promesse-paiement";
import { formaterFCFA } from "@/lib/facturation/calcul";
import { CANAUX_PROMESSE, ecartEnJours, formaterJourPromesse, LIBELLES_CANAL_PROMESSE, LONGUEUR_MAX_NOTE_PROMESSE, STATUT_PROMESSE, type StatutPromesse } from "@/lib/facturation/promesse-regles";
import { useT } from "@/lib/i18n/contexte";

export type PromesseAffichee = {
  id: string;
  datePromise: string;
  montant: number;
  canal: string;
  source: string;
  note: string | null;
  statut: StatutPromesse;
  creeLe: string;
  auteurNom: string | null;
};

/**
 * Promesse de paiement d'une facture : celle qui court (date, montant, qui l'a notée), de quoi en noter une nouvelle ou la retirer,
 * et l'historique des précédentes (tenue, non tenue, remplacée). Tant qu'une promesse court, la relance automatique est suspendue.
 * Les contrôles (droit, portée, date, montant) sont refaits côté serveur.
 */
export function CartePromesse({
  factureId,
  promesse,
  historique,
  peutModifier,
  estReglee,
  solde,
  aujourdhui,
  jourMax,
}: {
  factureId: string;
  promesse: PromesseAffichee | null;
  historique: PromesseAffichee[];
  peutModifier: boolean;
  estReglee: boolean;
  solde: number;
  aujourdhui: string;
  jourMax: string;
}) {
  const t = useT();
  const [formulaire, setFormulaire] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, startTransition] = useTransition();

  if (estReglee && !promesse && historique.length === 0) return null;
  const peutNoter = peutModifier && !estReglee && solde > 0;

  function enregistrer(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const donnees = new FormData(e.currentTarget);
    setErreur(null);
    startTransition(async () => {
      const resultat = await noterPromesse(factureId, null, donnees);
      if (resultat?.erreur) setErreur(resultat.erreur);
      else setFormulaire(false);
    });
  }

  function retirer() {
    if (!window.confirm(t("Retirer cette promesse de paiement ? Les relances automatiques reprendront."))) return;
    setErreur(null);
    startTransition(async () => {
      const resultat = await annulerPromesse(factureId);
      if (resultat?.erreur) setErreur(resultat.erreur);
    });
  }

  const ecart = promesse ? ecartEnJours(aujourdhui, promesse.datePromise) : 0;
  const echeance = !promesse ? "" : ecart > 1 ? t("dans {n} jours", { n: ecart }) : ecart === 1 ? t("demain") : ecart === 0 ? t("aujourd'hui") : t("date dépassée");

  return (
    <section aria-labelledby="titre-promesse" className="flex flex-col gap-2">
      <h2 id="titre-promesse" className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <CalendarClock className="size-4" aria-hidden />
        {t("Promesse de paiement")}
      </h2>
      <Card>
        <CardContent className="flex flex-col gap-3 text-sm">
          {promesse ? (
            <div className="flex flex-col gap-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={ecart < 0 ? "warning" : "info"}>{t(STATUT_PROMESSE.EN_COURS.libelle)}</Badge>
                <span className="font-medium">
                  {t("{montant} attendus le {date}", { montant: formaterFCFA(promesse.montant), date: formaterJourPromesse(promesse.datePromise, t.locale) })}
                </span>
                <span className="text-muted-foreground">({echeance})</span>
              </div>
              <p className="text-muted-foreground">
                {promesse.source === "CLIENT" ? t("Déclarée par le client depuis sa page de facture.") : t("Notée par {nom} ({canal}).", { nom: promesse.auteurNom ?? "—", canal: t(LIBELLES_CANAL_PROMESSE[promesse.canal] ?? promesse.canal).toLowerCase() })}
              </p>
              {promesse.note ? <p className="whitespace-pre-line rounded-lg bg-muted/50 px-3 py-2 text-muted-foreground">« {promesse.note} »</p> : null}
              <p className="text-xs text-muted-foreground">{t("Les relances automatiques de cette facture sont suspendues jusqu'à cette date.")}</p>
            </div>
          ) : (
            <p className="text-muted-foreground">{t("Aucune promesse en cours. Si le client vous annonce une date de paiement, notez-la : les relances automatiques seront suspendues jusqu'à cette date.")}</p>
          )}

          {peutNoter && !formulaire ? (
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant={promesse ? "outline" : "default"} size="sm" onClick={() => setFormulaire(true)}>
                <CalendarCheck data-icon="inline-start" aria-hidden />
                {promesse ? t("Noter une nouvelle date") : t("Noter une promesse")}
              </Button>
              {promesse ? (
                <Button type="button" variant="ghost" size="sm" disabled={enCours} onClick={retirer} className="text-muted-foreground hover:text-destructive">
                  {enCours ? <Spinner className="size-3.5" /> : null}
                  {t("Retirer la promesse")}
                </Button>
              ) : null}
            </div>
          ) : null}

          {peutNoter && formulaire ? (
            <form onSubmit={enregistrer} aria-label={t("Noter une promesse de paiement")} className="flex animate-in flex-col gap-4 rounded-xl border border-dashed p-3.5 duration-300 fade-in slide-in-from-top-1">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="date-promesse-equipe">{t("Le client paiera le")}</Label>
                  <Input id="date-promesse-equipe" name="datePromise" type="date" min={aujourdhui} max={jourMax} required defaultValue={promesse?.datePromise ?? ""} />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="montant-promesse">{t("Montant promis (FCFA)")}</Label>
                  <Input id="montant-promesse" name="montant" type="number" min={1} max={solde} step={1} defaultValue={solde} />
                </div>
                <div className="flex flex-col gap-2 sm:col-span-2">
                  <Label htmlFor="canal-promesse">{t("Comment l'a-t-il annoncé ?")}</Label>
                  <Select id="canal-promesse" name="canal" defaultValue="appel">
                    {CANAUX_PROMESSE.map((c) => (
                      <option key={c} value={c}>
                        {t(LIBELLES_CANAL_PROMESSE[c])}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="flex flex-col gap-2 sm:col-span-2">
                  <Label htmlFor="note-promesse-equipe">{t("Note (facultatif)")}</Label>
                  <Textarea id="note-promesse-equipe" name="note" rows={2} maxLength={LONGUEUR_MAX_NOTE_PROMESSE} placeholder={t("Ex. : attend son virement le 5.")} />
                </div>
              </div>
              {erreur ? <p role="alert" className="text-sm text-destructive">{erreur}</p> : null}
              <div className="flex gap-2">
                <Button type="submit" disabled={enCours}>
                  {enCours ? <Spinner /> : null}
                  {enCours ? t("Enregistrement…") : t("Enregistrer la promesse")}
                </Button>
                <Button type="button" variant="ghost" disabled={enCours} onClick={() => { setFormulaire(false); setErreur(null); }}>
                  {t("Annuler")}
                </Button>
              </div>
            </form>
          ) : null}

          {!formulaire && erreur ? <p role="alert" className="text-sm text-destructive">{erreur}</p> : null}

          {historique.length > 0 ? (
            <details className="group text-sm">
              <summary className="flex cursor-pointer list-none items-center gap-1.5 text-muted-foreground hover:text-foreground">
                <History className="size-3.5" aria-hidden />
                {historique.length > 1 ? t("Historique ({n} promesses)", { n: historique.length }) : t("Historique (1 promesse)")}
              </summary>
              <ul className="mt-2 flex flex-col divide-y divide-border rounded-lg border">
                {historique.map((h) => (
                  <li key={h.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                    <span>
                      {t("{montant} le {date}", { montant: formaterFCFA(h.montant), date: formaterJourPromesse(h.datePromise, t.locale, "medium") })}
                      <span className="text-muted-foreground"> · {h.source === "CLIENT" ? t("le client") : (h.auteurNom ?? "—")}</span>
                    </span>
                    <Badge variant={STATUT_PROMESSE[h.statut].variante}>{t(STATUT_PROMESSE[h.statut].libelle)}</Badge>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </CardContent>
      </Card>
    </section>
  );
}
