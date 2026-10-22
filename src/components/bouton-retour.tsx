"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useT } from "@/lib/i18n/contexte";

/**
 * « Retour » vers la page précédente du navigateur — pour une page de réglage atteinte par le menu, sans page d'origine
 * précise. Sans historique (onglet ouvert directement), il ramène à `repli`.
 */
export function BoutonRetour({ repli }: { repli: string }) {
  const t = useT();
  const routeur = useRouter();
  return (
    <button
      type="button"
      onClick={() => (window.history.length > 1 ? routeur.back() : routeur.push(repli))}
      className="inline-flex w-fit items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline"
    >
      <ArrowLeft className="size-4" aria-hidden /> {t("Retour")}
    </button>
  );
}
