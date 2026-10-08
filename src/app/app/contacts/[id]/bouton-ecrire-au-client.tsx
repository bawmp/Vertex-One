"use client";

import { Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/contexte";

/**
 * Bouton « Envoyer un email » de la fiche contact : déplie le formulaire d'écriture au client, fait défiler jusqu'à lui
 * et place le curseur sur l'objet. Désactivé, avec la raison, quand le client n'a pas d'adresse email.
 */
export function BoutonEcrireAuClient({ aUnEmail }: { aUnEmail: boolean }) {
  const t = useT();

  function ouvrir() {
    const formulaire = document.getElementById("ecrire-au-client") as HTMLDetailsElement | null;
    if (!formulaire) return;
    formulaire.open = true;
    formulaire.scrollIntoView({ behavior: "smooth", block: "center" });
    formulaire.querySelector<HTMLInputElement>('input[name="objet"]')?.focus({ preventScroll: true });
  }

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      onClick={ouvrir}
      disabled={!aUnEmail}
      title={aUnEmail ? undefined : t("Ce client n'a pas d'adresse email renseignée (voir sa fiche CRM).")}
    >
      <Mail data-icon="inline-start" aria-hidden />
      {t("Envoyer un email")}
    </Button>
  );
}
