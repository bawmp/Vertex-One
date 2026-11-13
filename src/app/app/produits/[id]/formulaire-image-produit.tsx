"use client";

import { useActionState, useState, useTransition } from "react";
import { Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { supprimerImageProduit, televerserImageProduit } from "@/lib/actions/produit";
import { useT } from "@/lib/i18n/contexte";
import { ChampImage } from "../champ-image";

/**
 * Image du produit sur sa fiche : ajouter, remplacer (aperçu et réduction automatique des grandes photos, voir champ-image.tsx) ou supprimer.
 * L'image actuelle est affichée en tête de la fiche ; ce bloc ne sert qu'à la changer.
 */
export function FormulaireImageProduit({ produitId, aUneImage }: { produitId: string; aUneImage: boolean }) {
  const t = useT();
  const [etat, action, enCours] = useActionState(televerserImageProduit.bind(null, produitId), null);
  const [supprime, demarrer] = useTransition();
  const [erreurSuppression, setErreurSuppression] = useState<string | null>(null);
  const [cle, setCle] = useState(0); // remet le champ à zéro après un envoi réussi

  function retirer() {
    if (!window.confirm(t("Supprimer l'image de ce produit ?"))) return;
    setErreurSuppression(null);
    demarrer(async () => {
      const r = await supprimerImageProduit(produitId);
      if (r.erreur) setErreurSuppression(r.erreur);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <form
        action={async (donnees) => {
          await action(donnees);
          setCle((n) => n + 1);
        }}
        className="flex flex-col gap-2"
      >
        <ChampImage key={cle} requis libelleVisible={false} />
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" size="sm" disabled={enCours}>
            {enCours ? <Spinner /> : <Upload data-icon="inline-start" aria-hidden />}
            {enCours ? t("Téléversement…") : aUneImage ? t("Remplacer l'image") : t("Téléverser")}
          </Button>
          {aUneImage ? (
            <Button type="button" size="sm" variant="outline" disabled={supprime} onClick={retirer} className="text-destructive hover:text-destructive">
              {supprime ? <Spinner /> : <Trash2 data-icon="inline-start" aria-hidden />}
              {t("Supprimer l'image")}
            </Button>
          ) : null}
        </div>
        {etat?.erreur ? <p role="alert" className="text-sm text-destructive">{etat.erreur}</p> : null}
        {etat?.confirmation ? <p role="status" className="text-sm text-emerald-700">{etat.confirmation}</p> : null}
      </form>
      {erreurSuppression ? <p role="alert" className="text-sm text-destructive">{erreurSuppression}</p> : null}
    </div>
  );
}
