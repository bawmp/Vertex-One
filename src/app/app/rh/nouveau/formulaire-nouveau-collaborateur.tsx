"use client";

import { useActionState, useState } from "react";
import { CheckCircle2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { SelecteurPersonne, type PersonneSelectionnable } from "@/components/selecteur-personne";
import { inviterCollaborateur, type EtatNouveauCollaborateur } from "@/lib/actions/nouveau-collaborateur";
import { CONTRATS_COLLABORATEUR, LIBELLE_CONTRAT } from "@/lib/rh/nouveau-collaborateur";

/**
 * Création de la fiche d'un collaborateur par invitation : employé, stagiaire professionnel, prestataire ou freelance. Pas de champ salaire :
 * la rémunération se saisit ensuite sur la fiche, par l'Administrateur seul. Le responsable n'est proposé qu'à l'Administrateur.
 */
export function FormulaireNouveauCollaborateur({ personnes, choixResponsable }: { personnes: PersonneSelectionnable[]; choixResponsable: boolean }) {
  const [etat, envoyer, enCours] = useActionState<EtatNouveauCollaborateur, FormData>(inviterCollaborateur, null);
  const [contrat, setContrat] = useState("CDI");
  const avecFin = contrat !== "CDI";
  return (
    <form action={envoyer} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="typeContrat">Type de collaborateur</Label>
          <Select id="typeContrat" name="typeContrat" value={contrat} onChange={(e) => setContrat(e.target.value)}>
            {CONTRATS_COLLABORATEUR.map((c) => (
              <option key={c} value={c}>
                {LIBELLE_CONTRAT[c]}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Adresse email</Label>
          <Input id="email" name="email" type="email" required />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="poste">Poste</Label>
        <Input id="poste" name="poste" placeholder="Ex : Assistant commercial" required maxLength={120} />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="dateEmbauche">Date d&apos;arrivée</Label>
          <Input id="dateEmbauche" name="dateEmbauche" type="date" required />
        </div>
        {avecFin ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="dateFin">{contrat === "STAGE" ? "Fin du stage" : contrat === "CDD" ? "Fin du CDD" : "Fin de la mission"}</Label>
            <Input id="dateFin" name="dateFin" type="date" required />
          </div>
        ) : null}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="dateNaissance">Date de naissance (facultatif)</Label>
          <Input id="dateNaissance" name="dateNaissance" type="date" />
        </div>
      </div>
      {choixResponsable ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="responsableId">Responsable (optionnel)</Label>
          <SelecteurPersonne id="responsableId" name="responsableId" personnes={personnes} placeholder="Rechercher un responsable…" />
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Vous serez le responsable de cette personne.</p>
      )}
      <p className="text-xs text-muted-foreground">
        La personne reçoit un email pour créer son compte (rôle Employé) ; sa fiche se crée à ce moment-là, avec ces informations. Elle y ajoutera sa photo et
        complétera ses coordonnées. Le salaire n&apos;est pas saisi ici : seul l&apos;Administrateur le renseigne, depuis la fiche.
      </p>
      {etat?.erreur ? <p role="alert" className="text-sm text-destructive">{etat.erreur}</p> : null}
      {etat?.succes ? (
        <p role="status" className="flex items-center gap-1.5 text-sm text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="size-4" aria-hidden />
          {etat.succes}
        </p>
      ) : null}
      <Button type="submit" disabled={enCours} className="self-start">
        {enCours ? <Spinner /> : <Send data-icon="inline-start" aria-hidden />}
        Créer la fiche et inviter
      </Button>
    </form>
  );
}
