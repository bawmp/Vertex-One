"use client";

import { useActionState, useEffect, useState } from "react";
import { Gift } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { ajouterPrime } from "@/lib/actions/paie";
import { moisCourant, TYPES_PRIME } from "@/lib/rh/paie-regles";
import { useT } from "@/lib/i18n/contexte";

/**
 * Accorder une prime (Administrateur). Sur la fiche d'une personne, `dossierRHId` est fixé ; sur la page des primes, `personnes` permet de
 * choisir le collaborateur. Le serveur relit le dossier : l'identifiant envoyé n'est jamais cru seul.
 */
export function FormulairePrime({ dossierRHId, personnes }: { dossierRHId?: string; personnes?: { dossierRHId: string; nom: string }[] }) {
  const t = useT();
  const [etat, action, enCours] = useActionState(ajouterPrime, null);
  const [ouvert, setOuvert] = useState(false);

  useEffect(() => {
    // Prime enregistrée : le formulaire se referme (la liste se met à jour toute seule).
    /* eslint-disable react-hooks/set-state-in-effect -- réaction à la réponse du serveur */
    if (etat?.ok) setOuvert(false);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [etat]);

  if (!ouvert) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => setOuvert(true)}>
        <Gift data-icon="inline-start" aria-hidden />
        {t("Accorder une prime")}
      </Button>
    );
  }

  return (
    <form action={action} className="flex animate-in flex-col gap-3 rounded-lg border p-4 fade-in">
      {dossierRHId ? (
        <input type="hidden" name="dossierRHId" value={dossierRHId} />
      ) : (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="prime-personne">{t("Collaborateur")}</Label>
          <Select id="prime-personne" name="dossierRHId" required defaultValue="">
            <option value="" disabled>
              {t("Choisir une personne")}
            </option>
            {(personnes ?? []).map((p) => (
              <option key={p.dossierRHId} value={p.dossierRHId}>
                {p.nom}
              </option>
            ))}
          </Select>
        </div>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="prime-type">{t("Type de prime")}</Label>
          <Select id="prime-type" name="type" required defaultValue="RENDEMENT">
            {TYPES_PRIME.map((x) => (
              <option key={x.cle} value={x.cle}>
                {t(x.libelle)}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="prime-montant">{t("Montant (FCFA)")}</Label>
          <Input id="prime-montant" name="montant" type="number" min={1} step={1} required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="prime-mois">{t("Mois concerné")}</Label>
          <Input id="prime-mois" name="moisConcerne" type="month" required defaultValue={moisCourant()} />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="prime-motif">{t("Motif (facultatif)")}</Label>
        <Input id="prime-motif" name="motif" maxLength={200} placeholder={t("ex : objectifs du trimestre atteints")} />
      </div>
      <p className="text-xs text-muted-foreground">{t("La prime sera ajoutée au bulletin du prochain salaire payé pour ce mois.")}</p>
      {etat?.erreur ? <p role="alert" className="text-sm text-destructive">{etat.erreur}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={enCours}>
          {enCours ? <Spinner /> : null}
          {enCours ? t("Enregistrement…") : t("Enregistrer la prime")}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOuvert(false)}>
          {t("Annuler")}
        </Button>
      </div>
    </form>
  );
}
