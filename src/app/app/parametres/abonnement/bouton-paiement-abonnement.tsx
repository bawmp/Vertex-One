"use client";

import { useState, useTransition } from "react";
import { CreditCard, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { declencherPaiementAbonnement } from "@/lib/actions/abonnement";
import { useT } from "@/lib/i18n/contexte";

/**
 * Paiement direct sans redirection (2026-09-22) : le numéro de téléphone est saisi ici, une invite USSD part
 * directement dessus — jamais de page hébergée Aangaraa Pay à ouvrir. La confirmation réelle arrive de façon
 * asynchrone (notification) ; cet écran ne fait qu'indiquer que la demande a été transmise au téléphone du client,
 * qui doit ensuite valider lui-même sur son appareil.
 */
export function BoutonPaiementAbonnement() {
  const t = useT();
  const [enCours, startTransition] = useTransition();
  const [telephone, setTelephone] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [declenche, setDeclenche] = useState(false);

  function payer() {
    setErreur(null);
    startTransition(async () => {
      const resultat = await declencherPaiementAbonnement(telephone);
      if (resultat.erreur) {
        setErreur(resultat.erreur);
        return;
      }
      setDeclenche(true);
    });
  }

  if (declenche) {
    return (
      <div className="flex flex-col items-center gap-1.5 text-center">
        <CheckCircle2 className="size-6 text-primary" aria-hidden />
        <p className="text-sm">{t("Vérifiez votre téléphone et validez la demande de paiement.")}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <Input
        type="tel"
        value={telephone}
        onChange={(e) => setTelephone(e.target.value)}
        placeholder={t("Numéro Mobile Money (ex : 690 11 12 22)")}
        disabled={enCours}
        className="max-w-xs"
      />
      <Button type="button" onClick={payer} disabled={enCours || !telephone}>
        {enCours ? <Spinner data-icon="inline-start" /> : <CreditCard data-icon="inline-start" aria-hidden />}
        {t("Régler mon abonnement (50 000 FCFA)")}
      </Button>
      {erreur ? <p className="text-xs text-destructive">{erreur}</p> : null}
    </div>
  );
}
