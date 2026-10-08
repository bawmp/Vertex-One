"use client";

import { useActionState, useRef, useEffect } from "react";
import { Send, CheckCircle2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { envoyerMessageClient } from "@/lib/actions/email-client";
import { useT } from "@/lib/i18n/contexte";

/**
 * Écrire directement au client : l'email PART RÉELLEMENT (Resend), au nom de l'entreprise, et sa réponse arrive à
 * l'expéditeur. Utilisé sur la fiche One CRM du contact et sur les devis / factures de One Books (`devisId` ou
 * `factureId` désignent alors le document, soumis à la portée Facturation). Le serveur relit l'adresse du client en
 * base : le formulaire n'envoie jamais de destinataire. Succès et échec restent affichés.
 */
export function FormulaireMessageClient({
  contactId,
  nomContact,
  emailContact,
  devisId,
  factureId,
}: {
  contactId: string;
  nomContact: string;
  emailContact: string | null;
  devisId?: string;
  factureId?: string;
}) {
  const t = useT();
  const [etat, action, enCours] = useActionState(envoyerMessageClient, null);
  const formulaire = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (etat?.envoye) formulaire.current?.reset(); // message parti : on vide le formulaire, le message reste dans l'historique
  }, [etat]);

  if (!emailContact) {
    return <p className="text-sm text-muted-foreground">{t("Ce client n'a pas d'adresse email renseignée (voir sa fiche CRM).")}</p>;
  }

  return (
    <details className="group rounded-lg border">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-2.5 text-sm font-medium">
        <Mail className="size-4" aria-hidden />
        {t("Écrire à {nom}", { nom: nomContact })}
        <span className="ml-auto text-xs font-normal text-muted-foreground">{emailContact}</span>
      </summary>
      <form ref={formulaire} action={action} className="flex flex-col gap-3 border-t p-4">
        <input type="hidden" name="contactId" value={contactId} />
        {devisId ? <input type="hidden" name="devisId" value={devisId} /> : null}
        {factureId ? <input type="hidden" name="factureId" value={factureId} /> : null}
        <div className="flex flex-col gap-1">
          <Label htmlFor={`objet-${contactId}`}>{t("Objet")}</Label>
          <Input id={`objet-${contactId}`} name="objet" required minLength={2} maxLength={200} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={`message-${contactId}`}>{t("Message")}</Label>
          <textarea
            id={`message-${contactId}`}
            name="message"
            required
            maxLength={5000}
            rows={6}
            className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" size="sm" disabled={enCours}>
            {enCours ? <Spinner /> : <Send data-icon="inline-start" aria-hidden />}
            {enCours ? t("Envoi en cours…") : t("Envoyer l'email")}
          </Button>
          {etat?.envoye ? (
            <span className="flex animate-in fade-in items-center gap-1.5 text-sm text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="size-4" aria-hidden />
              {t("Email envoyé avec succès.")}
            </span>
          ) : null}
          {etat?.erreur ? <span role="alert" className="animate-in fade-in text-sm text-destructive">{etat.erreur}</span> : null}
        </div>
      </form>
    </details>
  );
}
