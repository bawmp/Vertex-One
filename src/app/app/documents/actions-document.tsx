"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { RefreshCw, Trash2, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { effacerDocument, demanderSuppressionDocument, remplacerDocument } from "@/lib/actions/document";
import { useT } from "@/lib/i18n/contexte";

/**
 * Actions d'une ligne de One Docs : remplacer le fichier, supprimer (auteur ou administrateur) ou demander la
 * suppression (les autres, validée ensuite par l'administrateur). Ce composant ne fait que choisir les boutons à
 * montrer : le serveur revérifie droits, portée et sensibilité à chaque action. Résultats et erreurs restent
 * affichés sous les boutons.
 */
export function ActionsDocument({
  documentId,
  nom,
  peutSupprimerDirect,
  peutDemander,
  peutRemplacer,
  demandeEnAttente,
}: {
  documentId: string;
  nom: string;
  peutSupprimerDirect: boolean;
  peutDemander: boolean;
  peutRemplacer: boolean;
  demandeEnAttente: boolean;
}) {
  const t = useT();
  const formulaire = useRef<HTMLFormElement>(null);
  const champFichier = useRef<HTMLInputElement>(null);
  const [etatRemplacement, actionRemplacement, remplacementEnCours] = useActionState(remplacerDocument.bind(null, documentId), null);
  const [enCours, demarrer] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);

  function remplacer() {
    if (!champFichier.current?.files?.length) return;
    if (!window.confirm(t("Remplacer « {nom} » par ce nouveau fichier ? L'ancien fichier sera définitivement supprimé.", { nom }))) {
      champFichier.current.value = "";
      return;
    }
    formulaire.current?.requestSubmit();
  }

  function supprimer() {
    if (!window.confirm(t("Supprimer définitivement « {nom} » ? Cette action est irréversible.", { nom }))) return;
    setErreur(null);
    demarrer(async () => {
      await effacerDocument(documentId);
    });
  }

  function demander() {
    const motif = window.prompt(t("Motif de la demande de suppression (facultatif)"));
    if (motif === null) return;
    setErreur(null);
    demarrer(async () => {
      const r = await demanderSuppressionDocument(documentId, motif);
      if (r.erreur) setErreur(r.erreur);
    });
  }

  const occupe = enCours || remplacementEnCours;

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-1">
        {demandeEnAttente ? <Badge variant="warning">{t("Suppression demandée")}</Badge> : null}

        {peutRemplacer ? (
          <form ref={formulaire} action={actionRemplacement}>
            <input ref={champFichier} type="file" name="fichier" required className="hidden" onChange={remplacer} />
            <Button type="button" variant="ghost" size="icon-sm" disabled={occupe} onClick={() => champFichier.current?.click()} aria-label={`Remplacer ${nom}`} title={t("Remplacer le fichier")}>
              {remplacementEnCours ? <Spinner /> : <RefreshCw aria-hidden />}
            </Button>
          </form>
        ) : null}

        {peutSupprimerDirect ? (
          <Button type="button" variant="ghost" size="icon-sm" disabled={occupe} onClick={supprimer} aria-label={`Effacer ${nom}`} title={t("Supprimer")} className="hover:text-destructive">
            <Trash2 aria-hidden />
          </Button>
        ) : peutDemander && !demandeEnAttente ? (
          <Button type="button" variant="ghost" size="sm" disabled={occupe} onClick={demander} aria-label={`Demander la suppression de ${nom}`} className="hover:text-destructive">
            <Trash2 data-icon="inline-start" aria-hidden />
            {t("Demander la suppression")}
          </Button>
        ) : null}
      </div>

      {etatRemplacement?.remplace ? (
        <p className="flex animate-in fade-in items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="size-3.5" aria-hidden />
          {t("Document remplacé.")}
        </p>
      ) : null}
      {etatRemplacement?.erreur ? <p role="alert" className="max-w-64 animate-in fade-in text-right text-xs text-destructive">{etatRemplacement.erreur}</p> : null}
      {erreur ? <p role="alert" className="max-w-64 animate-in fade-in text-right text-xs text-destructive">{erreur}</p> : null}
    </div>
  );
}
