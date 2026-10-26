"use client";

import { useState, useTransition } from "react";
import { Spinner } from "@/components/ui/spinner";
import { definirRecrutementPartage } from "@/lib/actions/recrutement";

/** Partage du recrutement avec les autres entreprises du groupe : enregistré dès qu'on change la case ; n'agit que si l'autre entreprise l'a aussi activé. */
export function FormulairePartageGroupe({ actifInitial, groupeNom, autres }: { actifInitial: boolean; groupeNom: string; autres: { nom: string; partage: boolean }[] }) {
  const [actif, setActif] = useState(actifInitial);
  const [enCours, demarrer] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);

  function changer(valeur: boolean) {
    const avant = actif;
    setActif(valeur);
    setErreur(null);
    demarrer(async () => {
      const r = await definirRecrutementPartage(valeur);
      if (r?.erreur) {
        setActif(avant);
        setErreur(r.erreur);
      }
    });
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border p-4">
      <p className="text-sm font-medium">Partager le recrutement avec le groupe « {groupeNom} »</p>
      <label className="flex w-fit cursor-pointer items-center gap-2.5 text-sm">
        <input type="checkbox" checked={actif} disabled={enCours} onChange={(e) => changer(e.target.checked)} className="size-4 accent-primary" />
        Partager mes postes et mes candidatures avec les entreprises du groupe qui le font aussi
        {enCours ? <Spinner className="size-3.5" /> : null}
      </label>
      <p className="text-xs text-muted-foreground">
        Deux entreprises du groupe ne se voient que si les deux ont coché cette case. Les Administrateurs et les Managers de chacune voient alors les postes et les candidatures de l&apos;autre (CV compris),
        peuvent changer le statut d&apos;une candidature et corriger ses coordonnées ; le candidat est prévenu au nom de l&apos;entreprise qui a publié le poste. L&apos;embauche, la suppression et la
        modification des postes restent à l&apos;entreprise propriétaire. Rien d&apos;autre n&apos;est partagé.
      </p>
      {autres.length > 0 ? (
        <ul className="flex flex-col gap-0.5 text-xs text-muted-foreground">
          {autres.map((a) => (
            <li key={a.nom}>
              {a.nom} : {a.partage ? (actif ? "partage actif" : "a activé le partage — activez-le aussi pour vous voir mutuellement") : "n'a pas activé le partage"}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">Aucune autre entreprise dans ce groupe pour le moment.</p>
      )}
      {erreur ? (
        <p role="alert" className="text-xs text-destructive">
          {erreur}
        </p>
      ) : null}
    </div>
  );
}
