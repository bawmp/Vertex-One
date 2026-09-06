"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Send, CheckCircle2, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { envoyerFacture } from "@/lib/actions/facture";

export function FormulaireEnvoiFacture({ factureId, peutPersonnaliserModele }: { factureId: string; peutPersonnaliserModele: boolean }) {
  const [etat, action, enCours] = useActionState(envoyerFacture.bind(null, factureId), null);

  return (
    <form action={action} className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <Button type="submit" variant="outline" disabled={enCours}>
          {enCours ? <Spinner /> : <Send data-icon="inline-start" aria-hidden />}
          {enCours ? "Envoi en cours…" : "Envoyer par email"}
        </Button>
        {peutPersonnaliserModele ? (
          <Link
            href="/app/parametres/modeles-email"
            className="flex items-center gap-1 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            <Settings2 className="size-3.5" aria-hidden />
            Personnaliser le message
          </Link>
        ) : null}
      </div>
      {etat?.erreur ? (
        <p className="animate-in fade-in text-sm text-destructive">{etat.erreur}</p>
      ) : null}
      {etat?.envoye ? (
        <p className="flex animate-in fade-in items-center gap-1.5 text-sm text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="size-4" aria-hidden />
          Email envoyé avec succès.
        </p>
      ) : null}
    </form>
  );
}
