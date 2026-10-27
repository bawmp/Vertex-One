"use client";

import { useActionState, useState } from "react";
import { GraduationCap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Badge } from "@/components/ui/badge";
import { deciderStageProAction, type EtatStagiaire } from "@/lib/actions/stagiaires";

const dateFr = (iso: string) => new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(new Date(iso));

/**
 * Stagiaire PROFESSIONNEL : un employé de contrat « Stage » en période probatoire. Affiche la fin de stage, ce qu'il reste, et (Administrateur) la décision :
 * embauché (contrat CDI/CDD, compte conservé) ou non retenu (compte désactivé). Une fois la décision prise, elle n'est plus modifiable.
 */
export function BlocStagePro({ dossierRHId, finStage, joursRestants, decision, dateDecision, motifDecision, peutDecider }: { dossierRHId: string; finStage: string | null; joursRestants: number | null; decision: string | null; dateDecision: string | null; motifDecision: string | null; peutDecider: boolean }) {
  const [etat, decider, enCours] = useActionState<EtatStagiaire, FormData>(deciderStageProAction.bind(null, dossierRHId), null);
  const [choix, setChoix] = useState<"EMBAUCHE" | "NON_RETENU">("EMBAUCHE");
  const [contrat, setContrat] = useState<"CDI" | "CDD">("CDI");

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-dashed p-4">
      <div className="flex flex-wrap items-center gap-2">
        <GraduationCap className="size-4" aria-hidden />
        <p className="text-sm font-semibold">Stage professionnel — période probatoire</p>
        {decision ? (
          <Badge variant={decision === "EMBAUCHE" ? "success" : "neutral"}>{decision === "EMBAUCHE" ? "Embauché(e)" : "Non retenu(e)"}</Badge>
        ) : joursRestants !== null ? (
          <Badge variant={joursRestants < 0 ? "danger" : joursRestants <= 14 ? "warning" : "info"}>{joursRestants < 0 ? "Fin dépassée : décision à prendre" : `${joursRestants} j restants`}</Badge>
        ) : null}
      </div>

      {decision ? (
        <p className="text-sm text-muted-foreground">
          Décision du {dateDecision ? dateFr(dateDecision) : "—"}
          {motifDecision ? ` — ${motifDecision}` : ""}
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          {finStage ? `Fin de stage prévue le ${dateFr(finStage)}.` : "Aucune date de fin de stage renseignée : indiquez-la dans le dossier (date de fin de contrat)."} L&apos;indemnité se saisit comme un salaire (Administrateur seul), et vous pouvez ajouter des évaluations ci-dessous.
        </p>
      )}

      {!decision && peutDecider ? (
        <form action={decider} className="flex flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="decision">Décision</Label>
              <Select id="decision" name="decision" value={choix} onChange={(e) => setChoix(e.target.value as "EMBAUCHE" | "NON_RETENU")}>
                <option value="EMBAUCHE">L&apos;embaucher</option>
                <option value="NON_RETENU">Ne pas le retenir</option>
              </Select>
            </div>
            {choix === "EMBAUCHE" ? (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="typeContrat">Contrat</Label>
                <Select id="typeContrat" name="typeContrat" value={contrat} onChange={(e) => setContrat(e.target.value as "CDI" | "CDD")}>
                  <option value="CDI">CDI</option>
                  <option value="CDD">CDD</option>
                </Select>
              </div>
            ) : null}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="dateEffet">{choix === "EMBAUCHE" ? "Embauche à compter du" : "Départ le"}</Label>
              <Input id="dateEffet" name="dateEffet" type="date" required />
            </div>
            {choix === "EMBAUCHE" && contrat === "CDD" ? (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="dateFinCDD">Fin du CDD</Label>
                <Input id="dateFinCDD" name="dateFinCDD" type="date" required />
              </div>
            ) : null}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="motif">Motif ou remarque (facultatif)</Label>
            <Input id="motif" name="motif" maxLength={500} />
          </div>
          <p className="text-xs text-muted-foreground">
            {choix === "EMBAUCHE" ? "Le contrat passe de « Stage » au contrat choisi ; son compte et son dossier sont conservés." : "Son accès est désactivé à la date indiquée ; son dossier et son historique sont conservés."} Une décision ne peut pas être modifiée ensuite.
          </p>
          {etat?.erreur ? <p className="text-sm text-destructive">{etat.erreur}</p> : null}
          {etat?.succes ? <p className="text-sm text-emerald-700 dark:text-emerald-400">{etat.succes}</p> : null}
          <Button type="submit" disabled={enCours} className="self-start">
            {enCours ? <Spinner /> : null}
            Enregistrer la décision
          </Button>
        </form>
      ) : null}
    </div>
  );
}
