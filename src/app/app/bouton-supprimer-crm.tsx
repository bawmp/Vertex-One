"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { supprimerLead, supprimerContact, supprimerDeal } from "@/lib/actions/suppression-crm";
import { useT } from "@/lib/i18n/contexte";

const ACTIONS = { lead: supprimerLead, contact: supprimerContact, deal: supprimerDeal } as const;

/**
 * Supprimer un lead, un contact ou un deal (Administrateur). Une confirmation explicite précède l'action, qui est
 * irréversible. Si la suppression est refusée (ex. contact encore lié à des factures), la raison précise reste
 * affichée sous le bouton ; en cas de succès le serveur redirige vers la liste.
 */
export function BoutonSupprimerCrm({ type, id, nom }: { type: "lead" | "contact" | "deal"; id: string; nom: string }) {
  const t = useT();
  const [enCours, demarrer] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);

  function supprimer() {
    if (!window.confirm(t("Supprimer définitivement « {nom} » ? Cette action est irréversible.", { nom }))) return;
    setErreur(null);
    demarrer(async () => {
      const r = await ACTIONS[type](id);
      if (r?.erreur) setErreur(r.erreur);
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <Button type="button" size="sm" variant="outline" disabled={enCours} onClick={supprimer} className="w-fit text-destructive hover:text-destructive">
        {enCours ? <Spinner /> : <Trash2 data-icon="inline-start" aria-hidden />}
        {type === "lead" ? t("Supprimer le lead") : type === "contact" ? t("Supprimer le contact") : t("Supprimer le deal")}
      </Button>
      {erreur ? <p role="alert" className="max-w-xl animate-in fade-in text-sm text-destructive">{erreur}</p> : null}
    </div>
  );
}
