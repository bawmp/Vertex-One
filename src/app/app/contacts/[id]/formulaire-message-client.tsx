"use client";

import { useActionState, useEffect, useState } from "react";
import { Send, CheckCircle2, Mail, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { envoyerMessageClient } from "@/lib/actions/email-client";
import { elementsACompleter } from "@/lib/email/modeles";
import { useT } from "@/lib/i18n/contexte";

export type ModeleMessage = { cle: string; libelle: string; objet: string; message: string };

/**
 * Écrire directement au client : l'email PART RÉELLEMENT (Resend), au nom de l'entreprise, et sa réponse arrive à
 * l'expéditeur. Utilisé sur la fiche One CRM du contact et sur les devis / factures de One Books (`devisId` ou
 * `factureId` désignent alors le document, soumis à la portée Facturation). Le serveur relit l'adresse du client en
 * base : le formulaire n'envoie jamais de destinataire. Succès et échec restent affichés.
 *
 * `modeles` : textes proposés (Paramètres → Modèles d'email) qui préremplissent l'objet et le message. Le texte reste modifiable ;
 * tant qu'il contient un élément entre crochets (« [lien de suivi] »), l'envoi est bloqué pour qu'un « à compléter » ne parte jamais
 * chez un client.
 */
export function FormulaireMessageClient({
  contactId,
  nomContact,
  emailContact,
  devisId,
  factureId,
  modeles = [],
}: {
  contactId: string;
  nomContact: string;
  emailContact: string | null;
  devisId?: string;
  factureId?: string;
  modeles?: ModeleMessage[];
}) {
  const t = useT();
  const [etat, action, enCours] = useActionState(envoyerMessageClient, null);
  // Champs contrôlés : le texte choisi dans un modèle s'y écrit, et une erreur d'envoi ne vide jamais ce que la personne a saisi.
  const [objet, setObjet] = useState("");
  const [message, setMessage] = useState("");
  const [modele, setModele] = useState("");

  useEffect(() => {
    if (etat?.envoye) {
      // Message parti : on vide le formulaire, le message reste dans l'historique.
      /* eslint-disable react-hooks/set-state-in-effect -- réaction à la réponse du serveur */
      setObjet("");
      setMessage("");
      setModele("");
      /* eslint-enable react-hooks/set-state-in-effect */
    }
  }, [etat]);

  if (!emailContact) {
    return <p className="text-sm text-muted-foreground">{t("Ce client n'a pas d'adresse email renseignée (voir sa fiche CRM).")}</p>;
  }

  const aCompleter = elementsACompleter(`${objet}\n${message}`);

  function choisirModele(cle: string) {
    setModele(cle);
    const choisi = modeles.find((x) => x.cle === cle);
    if (choisi) {
      setObjet(choisi.objet);
      setMessage(choisi.message);
    }
  }

  return (
    <details id="ecrire-au-client" className="group rounded-lg border">
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-2 gap-y-0.5 px-4 py-2.5 text-sm font-medium">
        <Mail className="size-4" aria-hidden />
        {t("Écrire à {nom}", { nom: nomContact })}
        <span className="min-w-0 break-all text-xs font-normal text-muted-foreground sm:ml-auto sm:text-right">{emailContact}</span>
      </summary>
      <form action={action} className="flex flex-col gap-3 border-t p-4">
        <input type="hidden" name="contactId" value={contactId} />
        {devisId ? <input type="hidden" name="devisId" value={devisId} /> : null}
        {factureId ? <input type="hidden" name="factureId" value={factureId} /> : null}
        {modeles.length > 0 ? (
          <div className="flex flex-col gap-1">
            <Label htmlFor={`modele-${contactId}`}>{t("Modèle (facultatif)")}</Label>
            <Select id={`modele-${contactId}`} value={modele} onChange={(e) => choisirModele(e.target.value)}>
              <option value="">{t("Aucun modèle : je rédige moi-même")}</option>
              {modeles.map((x) => (
                <option key={x.cle} value={x.cle}>
                  {x.libelle}
                </option>
              ))}
            </Select>
          </div>
        ) : null}
        <div className="flex flex-col gap-1">
          <Label htmlFor={`objet-${contactId}`}>{t("Objet")}</Label>
          <Input id={`objet-${contactId}`} name="objet" required minLength={2} maxLength={200} value={objet} onChange={(e) => setObjet(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={`message-${contactId}`}>{t("Message")}</Label>
          <textarea
            id={`message-${contactId}`}
            name="message"
            required
            maxLength={5000}
            rows={modele ? 14 : 6}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </div>
        {aCompleter.length > 0 ? (
          <p role="status" className="flex animate-in items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 fade-in dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>{t("Remplacez d'abord les éléments entre crochets avant d'envoyer : {elements}", { elements: aCompleter.join(" ") })}</span>
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" size="sm" disabled={enCours || aCompleter.length > 0}>
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
