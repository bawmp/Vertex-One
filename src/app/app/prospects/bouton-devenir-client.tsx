"use client";

import { useState, useTransition } from "react";
import { UserCheck, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { devenirClient } from "@/lib/actions/prospect";
import { useT } from "@/lib/i18n/contexte";

/**
 * « Devenir client » : le seul passage d'un prospect vers les Contacts. Deux temps (bouton, puis confirmation) pour qu'un clic distrait ne crée jamais
 * un contact. En cas de succès le serveur redirige vers la fiche du nouveau contact ; un refus (prospect déjà client, droit absent) s'affiche ici.
 */
export function BoutonDevenirClient({ leadId }: { leadId: string }) {
  const t = useT();
  const [confirmer, setConfirmer] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();

  function valider() {
    setErreur(null);
    demarrer(async () => {
      const r = await devenirClient(leadId);
      if (r && "erreur" in r) {
        setErreur(r.erreur);
        setConfirmer(false);
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      {confirmer ? (
        <span className="flex flex-wrap items-center justify-end gap-2 rounded-md border border-emerald-600/30 bg-emerald-50 px-2.5 py-1.5 text-sm dark:bg-emerald-500/10">
          {t("Créer le contact et l'opportunité ?")}
          <Button size="sm" onClick={valider} disabled={enCours}>
            {enCours ? <Spinner /> : <CheckCircle2 data-icon="inline-start" aria-hidden />}
            {t("Oui, devenir client")}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setConfirmer(false)} disabled={enCours}>
            {t("Annuler")}
          </Button>
        </span>
      ) : (
        <Button size="sm" onClick={() => setConfirmer(true)}>
          <UserCheck data-icon="inline-start" aria-hidden />
          {t("Devenir client")}
        </Button>
      )}
      {erreur ? (
        <p role="alert" className="text-xs text-destructive">
          {erreur}
        </p>
      ) : null}
    </div>
  );
}
