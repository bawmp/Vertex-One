"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { supprimerDevis } from "@/lib/actions/devis";
import { useT } from "@/lib/i18n/contexte";

/**
 * Supprimer un devis en brouillon (jamais envoyé), après confirmation. En liste, un bouton discret (icône) ; sur la fiche du
 * devis, un bouton avec son libellé qui ramène à la liste. Si le serveur refuse, la raison reste affichée.
 */
export function BoutonSupprimerDevis({ devisId, numero, compact = false }: { devisId: string; numero: string; compact?: boolean }) {
  const t = useT();
  const [enCours, demarrer] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);

  function supprimer() {
    if (!window.confirm(t("Supprimer le brouillon {numero} ? Cette action est irréversible.", { numero }))) return;
    setErreur(null);
    demarrer(async () => {
      const r = await supprimerDevis(devisId, !compact);
      if (r?.erreur) setErreur(r.erreur);
    });
  }

  return (
    <div className="flex flex-col gap-1">
      {compact ? (
        <Button type="button" variant="ghost" size="icon-sm" disabled={enCours} onClick={supprimer} aria-label={t("Supprimer le brouillon {numero}", { numero })} title={t("Supprimer le brouillon")} className="text-muted-foreground hover:text-destructive">
          {enCours ? <Spinner /> : <Trash2 aria-hidden />}
        </Button>
      ) : (
        <Button type="button" variant="outline" disabled={enCours} onClick={supprimer} className="w-fit text-destructive hover:text-destructive">
          {enCours ? <Spinner /> : <Trash2 data-icon="inline-start" aria-hidden />}
          {t("Supprimer ce brouillon")}
        </Button>
      )}
      {erreur ? <p role="alert" className="max-w-sm animate-in fade-in text-xs text-destructive">{erreur}</p> : null}
    </div>
  );
}
