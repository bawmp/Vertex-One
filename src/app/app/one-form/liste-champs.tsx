"use client";

import { useState, useTransition } from "react";
import { ArrowUp, ArrowDown, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { reordonnerChamps, supprimerChamp } from "@/lib/actions/one-form";

const LIBELLE_TYPE: Record<string, string> = {
  TEXTE_COURT: "Texte court",
  TEXTE_LONG: "Texte long",
  EMAIL: "Email",
  TELEPHONE: "Téléphone",
  NOMBRE: "Nombre",
  DATE: "Date",
  CHOIX_UNIQUE: "Choix unique",
  CHOIX_MULTIPLE: "Choix multiple",
  LISTE_DEROULANTE: "Liste déroulante",
};

type Champ = { id: string; libelle: string; type: string; obligatoire: boolean };

export function ListeChamps({ formulaireId, champsInitiaux, peutModifier }: { formulaireId: string; champsInitiaux: Champ[]; peutModifier: boolean }) {
  const [champs, setChamps] = useState(champsInitiaux);
  const [enCours, startTransition] = useTransition();

  // champsInitiaux se rafraîchit après ajout/suppression d'un champ ailleurs
  // sur la page (revalidatePath, voir src/lib/actions/one-form.ts) — sans
  // cette synchronisation, useState(champsInitiaux) ne capturerait que la
  // valeur du tout premier rendu et la liste locale ne verrait jamais les
  // champs ajoutés depuis FormulaireAjoutChamp (bug réel trouvé en testant en
  // navigateur réel : "Ajouter le champ" réussissait côté serveur mais la
  // liste restait affichée comme vide). Ajustement pendant le rendu plutôt
  // que dans un effet (idiome React recommandé, évite un rendu en cascade) —
  // champsInitiaux n'est une référence stable que tant que le Server
  // Component parent n'a pas relu la base.
  const [champsPrecedents, setChampsPrecedents] = useState(champsInitiaux);
  if (champsInitiaux !== champsPrecedents) {
    setChampsPrecedents(champsInitiaux);
    setChamps(champsInitiaux);
  }

  function deplacer(index: number, direction: -1 | 1) {
    const cible = index + direction;
    if (cible < 0 || cible >= champs.length) return;
    const nouveaux = [...champs];
    [nouveaux[index], nouveaux[cible]] = [nouveaux[cible], nouveaux[index]];
    setChamps(nouveaux);
    startTransition(() => reordonnerChamps(formulaireId, nouveaux.map((c) => c.id)));
  }

  function supprimer(champId: string) {
    if (!window.confirm("Supprimer ce champ ?")) return;
    setChamps((prev) => prev.filter((c) => c.id !== champId));
    startTransition(() => supprimerChamp(champId, formulaireId));
  }

  if (champs.length === 0) {
    return <p className="text-sm text-muted-foreground">Aucun champ pour le moment — ajoutez-en un ci-dessous.</p>;
  }

  return (
    <div className="flex flex-col divide-y divide-border rounded-lg border border-border">
      {champs.map((champ, index) => (
        <div key={champ.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
          <div className="flex items-center gap-2">
            <span className="font-medium">{champ.libelle}</span>
            <Badge variant="neutral">{LIBELLE_TYPE[champ.type] ?? champ.type}</Badge>
            {champ.obligatoire ? <Badge variant="warning">Obligatoire</Badge> : null}
          </div>
          {peutModifier ? (
            <div className="flex items-center gap-1">
              {enCours ? <Spinner className="size-3.5" /> : null}
              <Button variant="ghost" size="icon-sm" disabled={index === 0} onClick={() => deplacer(index, -1)} aria-label="Monter">
                <ArrowUp className="size-3.5" aria-hidden />
              </Button>
              <Button variant="ghost" size="icon-sm" disabled={index === champs.length - 1} onClick={() => deplacer(index, 1)} aria-label="Descendre">
                <ArrowDown className="size-3.5" aria-hidden />
              </Button>
              <Button variant="ghost" size="icon-sm" onClick={() => supprimer(champ.id)} aria-label="Supprimer">
                <Trash2 className="size-3.5" aria-hidden />
              </Button>
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
