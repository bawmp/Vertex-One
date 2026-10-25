"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PaiementMobileMoney } from "@/components/formulaire/paiement-mobile-money";
import { declencherPaiementFactureInterne, verifierPaiementFactureInterne } from "@/lib/actions/facture";
import { useT } from "@/lib/i18n/contexte";

/**
 * Encaissement Mobile Money d'une facture par l'équipe, SANS redirection : on saisit le numéro du payeur et son opérateur, une
 * invite USSD part sur son téléphone, puis l'écran sonde le statut jusqu'à la confirmation (voir PaiementMobileMoney).
 */
export function BoutonPaiementEnLigne({ factureId, montant, numero }: { factureId: string; montant: string; numero: string }) {
  const t = useT();
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);

  if (!ouvert) {
    return (
      <Button type="button" variant="outline" onClick={() => setOuvert(true)}>
        <CreditCard data-icon="inline-start" aria-hidden />
        {t("Encaisser par Mobile Money")}
      </Button>
    );
  }

  return (
    <div className="w-full max-w-md rounded-xl border bg-card p-4">
      <PaiementMobileMoney
        etiquette={t("Montant à régler")}
        designation={`${t("Facture")} ${numero}`}
        montant={montant}
        declencher={(telephone, operateur) => declencherPaiementFactureInterne(factureId, telephone, operateur)}
        verifier={(tentativeId) => verifierPaiementFactureInterne(factureId, tentativeId)}
        onConfirme={() => router.refresh()}
      />
    </div>
  );
}
