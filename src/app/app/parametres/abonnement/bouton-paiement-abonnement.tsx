"use client";

import { useState, useTransition } from "react";
import { CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { genererLienPaiementAbonnement } from "@/lib/actions/abonnement";
import { useT } from "@/lib/i18n/contexte";

/**
 * Copie conforme de src/app/app/facturation/factures/[id]/bouton-paiement-en-ligne.tsx
 * pour l'abonnement plateforme — redirige vers l'URL de paiement CamPay,
 * jamais un lien Next.js interne.
 */
export function BoutonPaiementAbonnement() {
  const t = useT();
  const [enCours, startTransition] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);

  function generer() {
    setErreur(null);
    startTransition(async () => {
      const resultat = await genererLienPaiementAbonnement();
      if (resultat.erreur) {
        setErreur(resultat.erreur);
        return;
      }
      if (resultat.url) window.location.href = resultat.url;
    });
  }

  return (
    <div className="flex flex-col items-center gap-1.5">
      <Button type="button" onClick={generer} disabled={enCours}>
        {enCours ? <Spinner data-icon="inline-start" /> : <CreditCard data-icon="inline-start" aria-hidden />}
        {t("Régler mon abonnement (50 000 FCFA)")}
      </Button>
      {erreur ? <p className="text-xs text-destructive">{erreur}</p> : null}
    </div>
  );
}
