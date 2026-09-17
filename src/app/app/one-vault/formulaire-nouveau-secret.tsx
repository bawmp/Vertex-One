"use client";

import { useActionState, useState } from "react";
import { Plus, Dices } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { Card, CardContent } from "@/components/ui/card";
import { creerSecret } from "@/lib/actions/one-vault";
import { genererMotDePasse } from "./generer-mot-de-passe";

export function FormulaireNouveauSecret() {
  const [etat, action, enCours] = useActionState(creerSecret, null);
  const [ouvert, setOuvert] = useState(false);
  const [motDePasse, setMotDePasse] = useState("");

  // creerSecret() ne redirige jamais (contrairement à One Form, qui navigue
  // vers la fiche détail créée) — sans ce signal explicite, useActionState
  // ne permet pas de distinguer "pas encore soumis" de "vient de réussir"
  // (les deux valent `null`). Ajustement pendant le rendu plutôt que dans un
  // effet (idiome React recommandé, voir liste-champs.tsx pour le même
  // patron) — évite l'erreur ESLint react-hooks/set-state-in-effect.
  const [etatPrecedent, setEtatPrecedent] = useState(etat);
  if (etat !== etatPrecedent) {
    setEtatPrecedent(etat);
    if (etat?.succes) {
      setOuvert(false);
      setMotDePasse("");
    }
  }

  if (!ouvert) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => setOuvert(true)} className="self-start">
        <Plus data-icon="inline-start" aria-hidden />
        Nouveau secret
      </Button>
    );
  }

  return (
    <Card>
      <CardContent>
        <form action={action} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="titre">Titre</Label>
            <Input id="titre" name="titre" placeholder="ex : Compte Migadu" required autoFocus />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="identifiant">Identifiant (nom d&apos;utilisateur, email)</Label>
            <Input id="identifiant" name="identifiant" />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="motDePasse">Mot de passe</Label>
            <div className="flex gap-2">
              <Input id="motDePasse" name="motDePasse" type="text" value={motDePasse} onChange={(e) => setMotDePasse(e.target.value)} />
              <Button type="button" variant="outline" size="icon-sm" aria-label="Générer un mot de passe" onClick={() => setMotDePasse(genererMotDePasse())}>
                <Dices className="size-3.5" aria-hidden />
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="url">URL (optionnelle)</Label>
            <Input id="url" name="url" type="url" placeholder="https://" />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="notes">Notes (optionnelles)</Label>
            <Textarea id="notes" name="notes" rows={3} />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="partage" className="size-4" />
            Partager avec toute l&apos;équipe (sinon visible uniquement par vous et l&apos;Administrateur)
          </label>

          {etat?.erreur ? <p className="text-sm text-destructive">{etat.erreur}</p> : null}

          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={enCours}>
              {enCours ? <Spinner /> : null}
              Enregistrer
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setOuvert(false)}>
              Annuler
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
