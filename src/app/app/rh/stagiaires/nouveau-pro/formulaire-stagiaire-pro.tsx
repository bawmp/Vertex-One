"use client";

import { useActionState } from "react";
import { CheckCircle2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { SelecteurPersonne, type PersonneSelectionnable } from "@/components/selecteur-personne";
import { inviterStagiaireProAction, type EtatStagiaire } from "@/lib/actions/stagiaires";

/** Invitation d'un stagiaire professionnel. Le responsable n'est proposé qu'à l'Administrateur : un Manager l'est d'office. */
export function FormulaireStagiairePro({ personnes, choixResponsable }: { personnes: PersonneSelectionnable[]; choixResponsable: boolean }) {
  const [etat, envoyer, enCours] = useActionState<EtatStagiaire, FormData>(inviterStagiaireProAction, null);
  return (
    <form action={envoyer} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Email du stagiaire</Label>
        <Input id="email" name="email" type="email" required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="poste">Poste occupé</Label>
        <Input id="poste" name="poste" placeholder="Ex : Assistant commercial" required maxLength={120} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="dateDebut">Début du stage</Label>
          <Input id="dateDebut" name="dateDebut" type="date" required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="dateFin">Fin du stage</Label>
          <Input id="dateFin" name="dateFin" type="date" required />
        </div>
      </div>
      {choixResponsable ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="responsableId">Responsable (optionnel)</Label>
          <SelecteurPersonne id="responsableId" name="responsableId" personnes={personnes} placeholder="Rechercher un responsable…" />
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Vous serez le responsable de ce stagiaire.</p>
      )}
      <p className="text-xs text-muted-foreground">Le stagiaire reçoit un email pour créer son compte (rôle Employé, contrat Stage). L&apos;indemnité se saisit ensuite dans son dossier RH, par l&apos;Administrateur.</p>
      {etat?.erreur ? <p className="text-sm text-destructive">{etat.erreur}</p> : null}
      {etat?.succes ? (
        <p className="flex items-center gap-1.5 text-sm text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="size-4" aria-hidden />
          {etat.succes}
        </p>
      ) : null}
      <Button type="submit" disabled={enCours} className="self-start">
        {enCours ? <Spinner /> : <Send data-icon="inline-start" aria-hidden />}
        Inviter le stagiaire
      </Button>
    </form>
  );
}
