"use client";

import { useState, useTransition } from "react";
import { CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { genererLienPaiement } from "@/lib/actions/facture";
import { useT } from "@/lib/i18n/contexte";

/**
 * Redirige le navigateur vers l'URL de paiement CamPay retournée par
 * genererLienPaiement() — jamais un lien Next.js interne, CamPay héberge
 * lui-même la page de paiement (choix de l'opérateur Mobile Money, saisie
 * du numéro, code de confirmation).
 */
export function BoutonPaiementEnLigne({ factureId }: { factureId: string }) {
  const t = useT();
  const [enCours, startTransition] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);

  function generer() {
    setErreur(null);
    startTransition(async () => {
      const resultat = await genererLienPaiement(factureId);
      if (resultat.erreur) {
        setErreur(resultat.erreur);
        return;
      }
      if (resultat.url) window.location.href = resultat.url;
    });
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Button type="button" variant="outline" onClick={generer} disabled={enCours}>
        {enCours ? <Spinner data-icon="inline-start" /> : <CreditCard data-icon="inline-start" aria-hidden />}
        {t("Envoyer un lien de paiement Mobile Money")}
      </Button>
      {erreur ? <p className="text-xs text-destructive">{erreur}</p> : null}
    </div>
  );
}
