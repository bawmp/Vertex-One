import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import type { EvenementAbonnement } from "@/lib/abonnement/etat";

const JOUR_MS = 24 * 60 * 60 * 1000;

function joursRestants(date: Date): number {
  return Math.max(0, Math.ceil((date.getTime() - Date.now()) / JOUR_MS));
}

const TEXTES: Record<EvenementAbonnement, (essaiFinLe: Date, abonnementEcheanceLe: Date) => string> = {
  ESSAI_J3: (essaiFinLe) => `Votre essai gratuit se termine dans ${joursRestants(essaiFinLe)} jour(s) — pensez à régler votre abonnement pour continuer sans interruption.`,
  ESSAI_TERMINE: () => "Votre essai gratuit est terminé — réglez votre abonnement pour continuer à utiliser Vertex One (48h avant toute interruption d'accès).",
  ECHEANCE_J3: (_essaiFinLe, abonnementEcheanceLe) => `Votre abonnement arrive à échéance dans ${joursRestants(abonnementEcheanceLe)} jour(s).`,
  ECHEANCE_DEPASSEE: () => "Le paiement de votre abonnement est en retard — votre accès sera suspendu si le règlement n'est pas confirmé sous 48h.",
  SUSPENDU: () => "Votre accès est suspendu, faute de renouvellement d'abonnement.",
};

/**
 * Bannière non bloquante — jamais dans la sidebar elle-même, affichée
 * au-dessus du contenu de chaque page /app/*. Le blocage réel (statut
 * "suspendu") est géré séparément par la redirection dans
 * src/app/app/layout.tsx, jamais ici.
 */
export function BanniereAbonnement({
  evenement,
  essaiFinLe,
  abonnementEcheanceLe,
}: {
  evenement: EvenementAbonnement;
  essaiFinLe: Date;
  abonnementEcheanceLe: Date;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
      <div className="flex items-center gap-2">
        <AlertTriangle className="size-4 shrink-0" aria-hidden />
        <p>{TEXTES[evenement](essaiFinLe, abonnementEcheanceLe)}</p>
      </div>
      <Link href="/app/parametres/abonnement" className="shrink-0 whitespace-nowrap font-medium underline underline-offset-2">
        Gérer mon abonnement
      </Link>
    </div>
  );
}
