"use client";

import { useActionState, useState, useTransition } from "react";
import { Copy, Check, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { modifierParametresFormulaire, publierFormulaire, supprimerFormulaire } from "@/lib/actions/one-form";

type Formulaire = {
  id: string;
  titre: string;
  description: string | null;
  messageConfirmation: string;
  creerLeadALaReponse: boolean;
  notifierParEmail: boolean;
  ouvertureLe: Date | null;
  fermetureLe: Date | null;
  limiteReponses: number | null;
  publie: boolean;
  slug: string;
};

// <input type="datetime-local"> attend "yyyy-MM-ddTHH:mm" en heure locale —
// toISOString() décalerait l'affichage vers l'UTC, ce qui montrerait une
// heure différente de celle réellement enregistrée.
function versDatetimeLocal(date: Date | null): string {
  if (!date) return "";
  const dec = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${dec(date.getMonth() + 1)}-${dec(date.getDate())}T${dec(date.getHours())}:${dec(date.getMinutes())}`;
}

export function FormulaireParametres({ formulaire, urlPublique, peutModifier, peutSupprimer }: { formulaire: Formulaire; urlPublique: string; peutModifier: boolean; peutSupprimer: boolean }) {
  const [etat, action, enCours] = useActionState(modifierParametresFormulaire, null);
  const [publieEnCours, demarrerPublication] = useTransition();
  const [suppressionEnCours, demarrerSuppression] = useTransition();
  const [copie, setCopie] = useState(false);

  function copierUrl() {
    navigator.clipboard.writeText(urlPublique).then(() => setCopie(true));
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium">{formulaire.publie ? "Formulaire publié" : "Formulaire en brouillon"}</p>
          {peutModifier ? (
            <Button
              type="button"
              variant={formulaire.publie ? "outline" : "default"}
              size="sm"
              disabled={publieEnCours}
              onClick={() => demarrerPublication(() => publierFormulaire(formulaire.id, !formulaire.publie))}
            >
              {publieEnCours ? <Spinner /> : null}
              {formulaire.publie ? "Dépublier" : "Publier"}
            </Button>
          ) : null}
        </div>
        {formulaire.publie ? (
          <div className="flex items-center gap-2">
            <code className="truncate rounded-md bg-muted px-2 py-1 text-sm">{urlPublique}</code>
            <Button type="button" variant="ghost" size="icon-sm" aria-label="Copier le lien" onClick={copierUrl}>
              {copie ? <Check className="text-emerald-600" aria-hidden /> : <Copy aria-hidden />}
            </Button>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Publiez le formulaire pour obtenir son lien public.</p>
        )}
      </div>

      <form action={action} className="flex flex-col gap-4">
        <input type="hidden" name="formulaireId" value={formulaire.id} />

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="titre">Titre</Label>
          <Input id="titre" name="titre" defaultValue={formulaire.titre} required disabled={!peutModifier} />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="description">Description (optionnelle, affichée au-dessus du formulaire)</Label>
          <Textarea id="description" name="description" rows={2} defaultValue={formulaire.description ?? ""} disabled={!peutModifier} />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="messageConfirmation">Message de confirmation</Label>
          <Textarea id="messageConfirmation" name="messageConfirmation" rows={2} defaultValue={formulaire.messageConfirmation} required disabled={!peutModifier} />
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="creerLeadALaReponse" defaultChecked={formulaire.creerLeadALaReponse} className="size-4" disabled={!peutModifier} />
          Créer un Lead CRM à chaque réponse (si un champ Téléphone est rempli)
        </label>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="notifierParEmail" defaultChecked={formulaire.notifierParEmail} className="size-4" disabled={!peutModifier} />
          M&apos;avertir par email à chaque nouvelle réponse
        </label>

        <div className="flex flex-col gap-3 rounded-lg border border-dashed p-3">
          <p className="text-sm font-medium">Disponibilité (optionnelle)</p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor="ouvertureLe">Ouverture</Label>
              <Input id="ouvertureLe" name="ouvertureLe" type="datetime-local" defaultValue={versDatetimeLocal(formulaire.ouvertureLe)} disabled={!peutModifier} />
            </div>
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor="fermetureLe">Fermeture</Label>
              <Input id="fermetureLe" name="fermetureLe" type="datetime-local" defaultValue={versDatetimeLocal(formulaire.fermetureLe)} disabled={!peutModifier} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5 sm:w-56">
            <Label htmlFor="limiteReponses">Nombre maximal de réponses</Label>
            <Input
              id="limiteReponses"
              name="limiteReponses"
              type="number"
              min={1}
              step={1}
              defaultValue={formulaire.limiteReponses ?? ""}
              placeholder="Illimité"
              disabled={!peutModifier}
            />
          </div>
        </div>

        {etat?.erreur ? <p className="text-sm text-destructive">{etat.erreur}</p> : null}

        {peutModifier ? (
          <Button type="submit" size="sm" disabled={enCours} className="self-start">
            {enCours ? <Spinner /> : null}
            Enregistrer
          </Button>
        ) : null}
      </form>

      {peutSupprimer ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="self-start text-destructive hover:text-destructive"
          disabled={suppressionEnCours}
          onClick={() => {
            if (window.confirm("Supprimer définitivement ce formulaire et toutes ses réponses ?")) {
              demarrerSuppression(() => supprimerFormulaire(formulaire.id));
            }
          }}
        >
          {suppressionEnCours ? <Spinner /> : <Trash2 data-icon="inline-start" aria-hidden />}
          Supprimer le formulaire
        </Button>
      ) : null}
    </div>
  );
}
