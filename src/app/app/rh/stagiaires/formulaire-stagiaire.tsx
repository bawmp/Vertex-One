"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { SelecteurPersonne, type PersonneSelectionnable } from "@/components/selecteur-personne";
import type { EtatStagiaire } from "@/lib/actions/stagiaires";
import { useT } from "@/lib/i18n/contexte";

export type ValeursStagiaire = {
  nom?: string;
  dateNaissance?: string | null;
  telephone?: string | null;
  email?: string | null;
  etablissement?: string;
  filiere?: string | null;
  niveau?: string | null;
  tuteurEcoleNom?: string | null;
  tuteurEcoleContact?: string | null;
  conventionReference?: string | null;
  mission?: string | null;
  serviceId?: string | null;
  maitreStageId?: string | null;
  dateDebut?: string;
  dateFin?: string;
  indemniteMensuelle?: number | null;
  evaluation?: string | null;
};

type Action = (etat: EtatStagiaire, formData: FormData) => Promise<EtatStagiaire>;

/** Fiche d'un stagiaire académique (création ou modification). L'indemnité n'est proposée qu'à l'Administrateur. */
export function FormulaireStagiaire({ action, valeurs = {}, personnes, services, peutIndemnite, verrouille = false, libelleBouton }: { action: Action; valeurs?: ValeursStagiaire; personnes: PersonneSelectionnable[]; services: { id: string; nom: string }[]; peutIndemnite: boolean; verrouille?: boolean; libelleBouton?: string }) {
  const t = useT();
  const [etat, envoyer, enCours] = useActionState<EtatStagiaire, FormData>(action, null);
  const champ = (id: string, libelle: string, props: React.ComponentProps<typeof Input> = {}) => (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{libelle}</Label>
      <Input id={id} name={id} disabled={verrouille} defaultValue={String((valeurs as Record<string, unknown>)[id] ?? "")} {...props} />
    </div>
  );

  return (
    <form action={envoyer} className="flex flex-col gap-5">
      <fieldset className="flex flex-col gap-3 rounded-lg border p-4" disabled={verrouille}>
        <legend className="px-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase">{t("Le stagiaire")}</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {champ("nom", t("Nom complet"), { required: true, maxLength: 120 })}
          {champ("dateNaissance", t("Date de naissance (rappel d'anniversaire)"), { type: "date" })}
          {champ("telephone", t("Téléphone"), { maxLength: 40 })}
          {champ("email", t("Email (pour l'inviter s'il est embauché)"), { type: "email" })}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-3 rounded-lg border p-4" disabled={verrouille}>
        <legend className="px-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase">{t("École et convention")}</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {champ("etablissement", t("Établissement"), { required: true, maxLength: 160 })}
          {champ("filiere", t("Filière"), { maxLength: 120 })}
          {champ("niveau", t("Niveau (ex. Licence 3, Master 2)"), { maxLength: 80 })}
          {champ("conventionReference", t("Référence de la convention de stage"), { maxLength: 120 })}
          {champ("tuteurEcoleNom", t("Tuteur à l'école — nom"), { maxLength: 120 })}
          {champ("tuteurEcoleContact", t("Tuteur à l'école — contact"), { maxLength: 160 })}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-3 rounded-lg border p-4" disabled={verrouille}>
        <legend className="px-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase">{t("Le stage")}</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {champ("dateDebut", t("Début du stage"), { type: "date", required: true })}
          {champ("dateFin", t("Fin prévue du stage"), { type: "date", required: true })}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="maitreStageId">{t("Maître de stage")}</Label>
            <SelecteurPersonne id="maitreStageId" name="maitreStageId" personnes={personnes} defaultValue={valeurs.maitreStageId ?? undefined} placeholder={t("Rechercher un collègue…")} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="serviceId">{t("Département")}</Label>
            <Select id="serviceId" name="serviceId" defaultValue={valeurs.serviceId ?? ""}>
              <option value="">{t("Aucun")}</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nom}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="mission">{t("Mission")}</Label>
          <Textarea id="mission" name="mission" rows={2} maxLength={300} defaultValue={valeurs.mission ?? ""} />
        </div>
        {peutIndemnite ? (
          <div className="flex max-w-xs flex-col gap-1.5">
            <Label htmlFor="indemniteMensuelle">{t("Indemnité mensuelle (FCFA) — visible de l'Administrateur seul")}</Label>
            <Input id="indemniteMensuelle" name="indemniteMensuelle" type="number" min={0} step={1} inputMode="numeric" defaultValue={valeurs.indemniteMensuelle ?? ""} />
          </div>
        ) : null}
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="evaluation">{t("Évaluation du maître de stage")}</Label>
        <Textarea id="evaluation" name="evaluation" rows={4} maxLength={4000} disabled={verrouille} defaultValue={valeurs.evaluation ?? ""} />
      </div>

      {etat?.erreur ? <p className="text-sm text-destructive">{etat.erreur}</p> : null}
      {etat?.succes ? <p className="text-sm text-emerald-700 dark:text-emerald-400">{etat.succes}</p> : null}
      {verrouille ? null : (
        <Button type="submit" disabled={enCours} className="self-start">
          {enCours ? <Spinner /> : null}
          {libelleBouton ?? t("Enregistrer")}
        </Button>
      )}
    </form>
  );
}
