"use client";

import { useActionState } from "react";
import { Send, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { envoyerDocumentVente, type TypeDocumentVente } from "@/lib/actions/email-client";
import { useT } from "@/lib/i18n/contexte";

/**
 * « Envoyer par email » d'un bon de commande, d'un reçu de vente ou d'une facture d'acompte : envoi réel avec le PDF en
 * pièce jointe (voir envoyerDocumentVente). Le résultat — succès comme échec — reste affiché à côté du bouton : on ne
 * laisse jamais croire à un envoi qui n'a pas eu lieu.
 */
export function BoutonEnvoiDocumentVente({ type, documentId }: { type: TypeDocumentVente; documentId: string }) {
  const t = useT();
  const [etat, action, enCours] = useActionState(envoyerDocumentVente.bind(null, type, documentId), null);

  return (
    <form action={action} className="flex items-center gap-2">
      <Button type="submit" variant="ghost" size="icon-sm" disabled={enCours} aria-label={t("Envoyer par email")} title={t("Envoyer par email")}>
        {enCours ? <Spinner /> : <Send aria-hidden />}
      </Button>
      {etat?.envoye ? (
        <span className="flex animate-in fade-in items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="size-3.5" aria-hidden />
          {t("Email envoyé")}
        </span>
      ) : null}
      {etat?.erreur ? <span role="alert" className="max-w-56 animate-in fade-in text-xs text-destructive">{etat.erreur}</span> : null}
    </form>
  );
}
