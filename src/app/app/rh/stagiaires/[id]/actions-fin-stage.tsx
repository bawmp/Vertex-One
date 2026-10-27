"use client";

import { useActionState, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { cloturerStagiaireAction, embaucherStagiaireAction, supprimerStagiaireAction, type EtatStagiaire } from "@/lib/actions/stagiaires";

/** Fin du stage d'un stagiaire académique : le clore (terminé / interrompu, avec évaluation), l'embaucher (Administrateur) ou supprimer la fiche (Administrateur). */
export function ActionsFinStage({ ficheId, enCours, estAdmin, aEmail, peutSupprimer }: { ficheId: string; enCours: boolean; estAdmin: boolean; aEmail: boolean; peutSupprimer: boolean }) {
  const [etatCloture, cloturer, clotureEnCours] = useActionState<EtatStagiaire, FormData>(cloturerStagiaireAction.bind(null, ficheId), null);
  const [etatEmbauche, embaucher, embaucheEnCours] = useActionState<EtatStagiaire, FormData>(embaucherStagiaireAction.bind(null, ficheId), null);
  const [attente, demarrer] = useTransition();
  const [erreurSuppression, setErreurSuppression] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-5">
      {enCours ? (
        <form action={cloturer} className="flex flex-col gap-3 rounded-lg border p-4">
          <p className="text-sm font-semibold">Clore le stage</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="statut">Issue</Label>
              <Select id="statut" name="statut" defaultValue="TERMINE">
                <option value="TERMINE">Stage terminé</option>
                <option value="INTERROMPU">Stage interrompu</option>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="motif">Motif ou remarque (facultatif)</Label>
              <Input id="motif" name="motif" maxLength={500} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="evaluationFinale">Évaluation finale (facultatif, complète celle de la fiche)</Label>
            <Textarea id="evaluationFinale" name="evaluation" rows={3} maxLength={4000} />
          </div>
          {etatCloture?.erreur ? <p className="text-sm text-destructive">{etatCloture.erreur}</p> : null}
          {etatCloture?.succes ? <p className="text-sm text-emerald-700 dark:text-emerald-400">{etatCloture.succes}</p> : null}
          <Button type="submit" variant="outline" disabled={clotureEnCours} className="self-start">
            {clotureEnCours ? <Spinner /> : null}
            Clore le stage
          </Button>
        </form>
      ) : null}

      {estAdmin && enCours ? (
        <form action={embaucher} className="flex flex-col gap-3 rounded-lg border border-dashed p-4">
          <p className="text-sm font-semibold">Le prendre dans l&apos;entreprise</p>
          <p className="text-xs text-muted-foreground">Une invitation (valable 72 h) est créée à l&apos;adresse de la fiche ; en l&apos;acceptant, la personne crée son compte et reçoit son dossier RH.{aEmail ? "" : " Cette fiche n'a pas d'email : ajoutez-en un d'abord."}</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="role">Rôle</Label>
              <Select id="role" name="role" defaultValue="EMPLOYE">
                <option value="EMPLOYE">Employé</option>
                <option value="MANAGER">Manager</option>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="typeContrat">Contrat</Label>
              <Select id="typeContrat" name="typeContrat" defaultValue="STAGE">
                <option value="STAGE">Stage professionnel (période probatoire)</option>
                <option value="CDD">CDD</option>
                <option value="CDI">CDI</option>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="dateEmbauche">Date d&apos;entrée</Label>
              <Input id="dateEmbauche" name="dateEmbauche" type="date" required />
            </div>
          </div>
          {etatEmbauche?.erreur ? <p className="text-sm text-destructive">{etatEmbauche.erreur}</p> : null}
          {etatEmbauche?.succes ? <p className="text-sm text-emerald-700 dark:text-emerald-400">{etatEmbauche.succes}</p> : null}
          <Button type="submit" disabled={embaucheEnCours || !aEmail} className="self-start">
            {embaucheEnCours ? <Spinner /> : null}
            Créer l&apos;invitation
          </Button>
        </form>
      ) : null}

      {peutSupprimer ? (
        <div className="flex flex-col gap-1">
          <button
            type="button"
            disabled={attente}
            onClick={() => {
              if (!window.confirm("Supprimer définitivement cette fiche de stagiaire (données personnelles comprises) ?")) return;
              demarrer(async () => {
                const r = await supprimerStagiaireAction(ficheId);
                if (r?.erreur) setErreurSuppression(r.erreur);
              });
            }}
            className="w-fit text-xs text-destructive hover:underline disabled:opacity-50"
          >
            Supprimer la fiche
          </button>
          {erreurSuppression ? <p className="text-xs text-destructive">{erreurSuppression}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
