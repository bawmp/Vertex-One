"use client";

import { useActionState, useState } from "react";
import { LayoutTemplate, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { creerFormulaire, creerFormulaireDepuisModele } from "@/lib/actions/one-form";
import { MODELES_FORMULAIRES } from "@/lib/one-form/modeles";

export function FormulaireNouveauFormulaire() {
  const [etat, action, enCours] = useActionState(creerFormulaire, null);
  const [etatModele, actionModele, modeleEnCours] = useActionState(creerFormulaireDepuisModele, null);
  const [mode, setMode] = useState<"ferme" | "vierge" | "modeles">("ferme");

  if (mode === "ferme") {
    return (
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => setMode("modeles")}>
          <LayoutTemplate data-icon="inline-start" aria-hidden />
          Utiliser un modèle
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => setMode("vierge")}>
          <Plus data-icon="inline-start" aria-hidden />
          Formulaire vierge
        </Button>
      </div>
    );
  }

  if (mode === "vierge") {
    return (
      <form action={action} className="flex items-center gap-2 rounded-lg border p-3">
        <Input name="titre" placeholder="ex : Demande de devis" required autoFocus />
        <Button type="submit" size="sm" disabled={enCours}>
          {enCours ? <Spinner /> : "Créer"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setMode("ferme")}>
          Annuler
        </Button>
        {etat?.erreur ? <p className="text-sm text-destructive">{etat.erreur}</p> : null}
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Choisir un modèle</p>
          <p className="text-xs text-muted-foreground">Le formulaire est créé en brouillon : vous pouvez tout modifier avant de le publier.</p>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={() => setMode("ferme")}>
          Annuler
        </Button>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {MODELES_FORMULAIRES.map((modele) => (
          <form key={modele.id} action={actionModele} className="flex flex-col justify-between gap-2 rounded-lg border border-border p-3">
            <input type="hidden" name="modeleId" value={modele.id} />
            <div>
              <p className="text-sm font-medium">{modele.nom}</p>
              <p className="text-xs text-muted-foreground">{modele.resume}</p>
              <p className="mt-1 text-xs text-muted-foreground">{modele.champs.length} champs</p>
            </div>
            <Button type="submit" size="sm" variant="outline" disabled={modeleEnCours} className="self-start">
              {modeleEnCours ? <Spinner /> : null}
              Utiliser ce modèle
            </Button>
          </form>
        ))}
      </div>
      {etatModele?.erreur ? <p className="text-sm text-destructive">{etatModele.erreur}</p> : null}
    </div>
  );
}
