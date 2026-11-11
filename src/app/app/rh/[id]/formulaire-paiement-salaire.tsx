"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { FileText, Banknote, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { payerSalaire } from "@/lib/actions/paie";
import { jourCourant, moisCourant, MODES_PAIEMENT, NB_MAX_RETENUES } from "@/lib/rh/paie-regles";
import { useT } from "@/lib/i18n/contexte";

/**
 * Enregistrer le paiement du salaire d'un mois (Administrateur) : le bulletin de paie est généré aussitôt. Le salaire de base et les primes
 * non payées viennent de la base ; l'Administrateur n'écrit que les retenues éventuelles (aucun calcul de cotisation dans le produit).
 */
export function FormulairePaiementSalaire({ dossierRHId, salaireRenseigne, nbPrimesEnAttente }: { dossierRHId: string; salaireRenseigne: boolean; nbPrimesEnAttente: number }) {
  const t = useT();
  const [etat, action, enCours] = useActionState(payerSalaire, null);
  const [ouvert, setOuvert] = useState(false);

  if (etat?.ok && etat.paiementId) {
    return (
      <div role="status" className="flex animate-in flex-wrap items-center gap-3 rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 fade-in dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-200">
        <CheckCircle2 className="size-4 shrink-0" aria-hidden />
        <span>{t("Salaire payé : le bulletin est prêt. Relisez-le, corrigez-le si besoin, puis envoyez-le à la personne.")}</span>
        <Link href={`/app/rh/${dossierRHId}/bulletins/${etat.paiementId}`} target="_blank" className="font-medium underline underline-offset-2">
          {t("Ouvrir le bulletin")}
        </Link>
      </div>
    );
  }

  if (!ouvert) {
    return (
      <Button type="button" size="sm" onClick={() => setOuvert(true)} disabled={!salaireRenseigne}>
        <Banknote data-icon="inline-start" aria-hidden />
        {t("Enregistrer un paiement de salaire")}
      </Button>
    );
  }

  return (
    <form action={action} className="flex animate-in flex-col gap-3 rounded-lg border p-4 fade-in">
      <input type="hidden" name="dossierRHId" value={dossierRHId} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="paie-mois">{t("Mois payé")}</Label>
          <Input id="paie-mois" name="mois" type="month" required defaultValue={moisCourant()} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="paie-date">{t("Date du paiement")}</Label>
          <Input id="paie-date" name="datePaiement" type="date" required defaultValue={jourCourant()} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="paie-mode">{t("Mode de paiement")}</Label>
          <Select id="paie-mode" name="modePaiement" required defaultValue="VIREMENT">
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
        <p className="text-xs text-muted-foreground">{t("Avance sur salaire, cotisations, impôt… : écrivez vous-même ce que vous retenez. Vertex One ne calcule aucune cotisation.")}</p>
        {Array.from({ length: NB_MAX_RETENUES }, (_, i) => i + 1).map((n) => (
          <div key={n} className="grid grid-cols-[1fr_9rem] gap-2">
            <Input name={`retenueLibelle${n}`} maxLength={80} placeholder={t("Nom de la retenue")} aria-label={t("Nom de la retenue {n}", { n })} />
            <Input name={`retenueMontant${n}`} type="number" min={1} step={1} placeholder={t("FCFA")} aria-label={t("Montant de la retenue {n}", { n })} />
          </div>
        ))}
      </fieldset>

      <p className="text-xs text-muted-foreground">
        {nbPrimesEnAttente > 0 ? t("{n} prime(s) en attente seront ajoutées au bulletin.", { n: nbPrimesEnAttente }) : t("Aucune prime en attente : le bulletin reprendra le salaire de base.")}
      </p>
      {etat?.erreur ? <p role="alert" className="text-sm text-destructive">{etat.erreur}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={enCours}>
          {enCours ? <Spinner /> : <FileText data-icon="inline-start" aria-hidden />}
          {enCours ? t("Enregistrement…") : t("Payer et générer le bulletin")}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOuvert(false)}>
          {t("Annuler")}
        </Button>
      </div>
    </form>
  );
}
