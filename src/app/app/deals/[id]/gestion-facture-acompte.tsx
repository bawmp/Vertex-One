"use client";

import { useActionState, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { enregistrerPaiementFactureAcompte, appliquerAcompteSurFacture, annulerFactureAcompte } from "@/lib/actions/facture-acompte";
import { useT } from "@/lib/i18n/contexte";
import { m } from "@/lib/i18n/catalogue";


const MOYENS_PAIEMENT: { valeur: string; libelle: string }[] = [
  { valeur: "orange_money", libelle: m("Orange Money") },
  { valeur: "mtn_momo", libelle: m("MTN MoMo") },
  { valeur: "especes", libelle: m("Espèces") },
  { valeur: "virement", libelle: m("Virement") },
  { valeur: "manuel", libelle: m("Autre") },
];

export function GestionFactureAcompte({
  factureAcompteId,
  statut,
  montantRestant,
  facturesEligibles,
}: {
  factureAcompteId: string;
  statut: string;
  montantRestant: number;
  facturesEligibles: { id: string; numero: string; montantTTC: number }[];
}) {
  const t = useT();
  const [formPaiementOuvert, setFormPaiementOuvert] = useState(false);
  const [etat, action, enCoursPaiement] = useActionState(enregistrerPaiementFactureAcompte, null);
  const [factureChoisie, setFactureChoisie] = useState(facturesEligibles[0]?.id ?? "");
  const [enCoursApplication, startApplication] = useTransition();
  const [enCoursAnnulation, startAnnulation] = useTransition();

  if (statut === "EMISE") {
    if (!formPaiementOuvert) {
      return (
        <div className="flex items-center gap-1">
          <Button type="button" size="sm" variant="outline" onClick={() => setFormPaiementOuvert(true)}>
            {t("Enregistrer le paiement")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="text-muted-foreground hover:text-destructive"
            disabled={enCoursAnnulation}
            onClick={() => startAnnulation(() => annulerFactureAcompte(factureAcompteId))}
          >
            {enCoursAnnulation ? <Spinner /> : null}
            {t("Annuler")}
          </Button>
        </div>
      );
    }

    return (
      <form action={action} className="flex items-center gap-1.5">
        <input type="hidden" name="factureAcompteId" value={factureAcompteId} />
        <Select name="moyenPaiement" defaultValue="manuel" className="h-8 text-xs">
          {MOYENS_PAIEMENT.map((m) => (
            <option key={m.valeur} value={m.valeur}>
              {t(m.libelle)}
            </option>
          ))}
        </Select>
        <Input name="referenceTransaction" placeholder={t("Référence (optionnel)")} className="h-8 w-36 text-xs" />
        <Button type="submit" size="sm" disabled={enCoursPaiement}>
          {enCoursPaiement ? <Spinner /> : null}
          {t("Confirmer")}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setFormPaiementOuvert(false)}>
          {t("Annuler")}
        </Button>
        {etat?.erreur ? <p className="text-xs text-destructive">{etat.erreur}</p> : null}
      </form>
    );
  }

  if (statut === "PAYEE") {
    if (facturesEligibles.length === 0) {
      return <p className="text-xs text-muted-foreground">{t("Aucune facture émise de {montant} FCFA ou moins pour appliquer ce solde.", { montant: montantRestant })}</p>;
    }
    return (
      <div className="flex items-center gap-1.5">
        <Select value={factureChoisie} onChange={(e) => setFactureChoisie(e.target.value)} className="h-8 text-xs">
          {facturesEligibles.map((f) => (
            <option key={f.id} value={f.id}>
              {f.numero} ({new Intl.NumberFormat(t.locale).format(f.montantTTC)} FCFA)
            </option>
          ))}
        </Select>
        <Button
          type="button"
          size="sm"
          disabled={enCoursApplication}
          onClick={() => startApplication(() => appliquerAcompteSurFacture(factureAcompteId, factureChoisie))}
        >
          {enCoursApplication ? <Spinner /> : null}
          {t("Appliquer")}
        </Button>
      </div>
    );
  }

  return null;
}
