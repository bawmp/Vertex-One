"use client";

import { useActionState, useState } from "react";
import { Send, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SelecteurPersonne, type PersonneSelectionnable } from "@/components/selecteur-personne";
import { creerInvitation } from "@/lib/actions/invitation";
import { modulesRestreignables } from "@/lib/modules-libelles";
import { SelecteurModules } from "./selecteur-modules";

export function FormulaireInvitation({ collegues }: { collegues: PersonneSelectionnable[] }) {
  const [etat, action, enCours] = useActionState(creerInvitation, null);
  const [role, setRole] = useState<"MANAGER" | "EMPLOYE" | "CLIENT">("EMPLOYE");
  // Par défaut : tous les modules du rôle ; l'Administrateur décoche ce qu'il veut retirer.
  const [modules, setModules] = useState<string[]>(modulesRestreignables("EMPLOYE"));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Inviter un collaborateur</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={action} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">Email de l&apos;invité</Label>
            <Input id="email" name="email" type="email" required />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="roleProposee">Rôle</Label>
            <Select
              id="roleProposee"
              name="roleProposee"
              required
              defaultValue="EMPLOYE"
              onChange={(e) => {
                const suivant = e.target.value as "MANAGER" | "EMPLOYE" | "CLIENT";
                setRole(suivant);
                if (suivant !== "CLIENT") setModules(modulesRestreignables(suivant));
              }}
            >
              <option value="MANAGER">Manager</option>
              <option value="EMPLOYE">Employé</option>
              <option value="CLIENT">Client</option>
            </Select>
          </div>

          {role !== "CLIENT" ? (
            <div className="flex flex-col gap-2">
              <Label>Modules accessibles</Label>
              <input type="hidden" name="restreindreModules" value="1" />
              <SelecteurModules role={role} valeurs={modules} onChange={setModules} name="modules" />
            </div>
          ) : null}

          <div className="flex flex-col gap-2">
            <Label htmlFor="postePropose">Poste</Label>
            <Input id="postePropose" name="postePropose" placeholder="Ex : Chargé de clientèle" />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="typeContratPropose">Type de contrat</Label>
            <Select id="typeContratPropose" name="typeContratPropose" defaultValue="CDI">
              <option value="CDI">CDI</option>
              <option value="CDD">CDD</option>
              <option value="STAGE">Stage</option>
              <option value="PRESTATAIRE">Prestataire</option>
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="dateEmbauchePropose">Date d&apos;embauche réelle</Label>
            <Input id="dateEmbauchePropose" name="dateEmbauchePropose" type="date" />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="managerPropose">Manager (optionnel)</Label>
            <SelecteurPersonne id="managerPropose" name="managerPropose" personnes={collegues} placeholder="Rechercher un manager…" />
          </div>

          {etat?.erreur ? <p className="text-sm text-destructive">{etat.erreur}</p> : null}
          {etat?.succes ? (
            <p className="flex items-center gap-1.5 text-sm text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="size-4" aria-hidden />
              {etat.succes}
            </p>
          ) : null}

          <Button type="submit" disabled={enCours} className="self-start">
            {enCours ? <Spinner /> : <Send data-icon="inline-start" aria-hidden />}
            {enCours ? "Envoi…" : "Inviter"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
