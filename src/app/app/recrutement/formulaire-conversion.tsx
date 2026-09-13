"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { convertirCandidatureEnEmploye } from "@/lib/actions/recrutement";

export function FormulaireConversion({ candidatureId, statut }: { candidatureId: string; statut: string }) {
  const [etat, action, enCours] = useActionState(convertirCandidatureEnEmploye, null);
  const [ouvert, setOuvert] = useState(false);

  if (etat?.succes) {
    return <p className="text-sm text-emerald-700">{etat.succes}</p>;
  }

  // statut passe à EMBAUCHE dès la conversion réussie (revalidatePath), ce
  // qui re-render ce composant avec de nouvelles props sans le démonter —
  // contrairement à un gating strict sur statut === "OFFRE" côté parent, qui
  // ferait disparaître ce composant (et son etat.succes ci-dessus) avant que
  // le message de confirmation n'ait pu s'afficher.
  if (statut === "EMBAUCHE") {
    return <p className="text-xs text-muted-foreground">Déjà convertie en employé.</p>;
  }

  if (!ouvert) {
    return (
      <Button type="button" size="xs" variant="outline" onClick={() => setOuvert(true)}>
        Convertir en employé
      </Button>
    );
  }

  return (
    <form action={action} className="flex flex-wrap items-end gap-2 rounded-lg border p-3">
      <input type="hidden" name="candidatureId" value={candidatureId} />
      <div className="flex flex-col gap-1">
        <Label htmlFor={`role-${candidatureId}`}>Rôle</Label>
        <Select id={`role-${candidatureId}`} name="roleProposee" className="w-32" defaultValue="EMPLOYE">
          <option value="EMPLOYE">Employé</option>
          <option value="MANAGER">Manager</option>
        </Select>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor={`contrat-${candidatureId}`}>Contrat</Label>
        <Select id={`contrat-${candidatureId}`} name="typeContratPropose" className="w-28" defaultValue="CDI">
          <option value="CDI">CDI</option>
          <option value="CDD">CDD</option>
          <option value="STAGE">Stage</option>
          <option value="PRESTATAIRE">Prestataire</option>
        </Select>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor={`date-${candidatureId}`}>Date d&apos;embauche</Label>
        <Input id={`date-${candidatureId}`} name="dateEmbauchePropose" type="date" className="w-40" required />
      </div>
      <Button type="submit" size="sm" disabled={enCours}>
        {enCours ? <Spinner className="size-3.5" /> : null}
        Envoyer l&apos;invitation
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => setOuvert(false)}>
        Annuler
      </Button>
      {etat?.erreur ? <p className="w-full text-xs text-destructive">{etat.erreur}</p> : null}
    </form>
  );
}
