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
import { modulesDeBase, modulesRestreignables } from "@/lib/modules-libelles";
import { SelecteurModules } from "./selecteur-modules";
import { useT } from "@/lib/i18n/contexte";

export function FormulaireInvitation({ collegues, stagePro = false }: { collegues: PersonneSelectionnable[]; stagePro?: boolean }) {
  const t = useT();
  const [etat, action, enCours] = useActionState(creerInvitation, null);
  // Arrivée depuis « Stagiaire professionnel » (page Stagiaires) : contrat Stage déjà choisi, date de fin demandée.
  const [contrat, setContrat] = useState(stagePro ? "STAGE" : "CDI");
  const [role, setRole] = useState<"MANAGER" | "EMPLOYE" | "CLIENT" | "COMPTABLE">("EMPLOYE");
  // Un Employé (stagiaire et prestataire compris) commence avec le socle seul : sa fiche, ses tâches et le chat ; l'Administrateur coche les modules
  // à lui ouvrir. Un Manager commence avec tous les modules de son rôle.
  const modulesInitiaux = (r: "MANAGER" | "EMPLOYE") => (r === "EMPLOYE" ? modulesDeBase("EMPLOYE") : modulesRestreignables(r));
  const [modules, setModules] = useState<string[]>(modulesInitiaux("EMPLOYE"));

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("Inviter un collaborateur")}</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={action} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">{t("Email de l'invité")}</Label>
            <Input id="email" name="email" type="email" required />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="roleProposee">{t("Rôle")}</Label>
            <Select
              id="roleProposee"
              name="roleProposee"
              required
              defaultValue="EMPLOYE"
              onChange={(e) => {
                const suivant = e.target.value as "MANAGER" | "EMPLOYE" | "CLIENT" | "COMPTABLE";
                setRole(suivant);
                if (suivant === "MANAGER" || suivant === "EMPLOYE") setModules(modulesInitiaux(suivant));
              }}
            >
              <option value="MANAGER">{t("Manager")}</option>
              <option value="EMPLOYE">{t("Employé")}</option>
              <option value="COMPTABLE">{t("Comptable externe")}</option>
              <option value="CLIENT">{t("Client")}</option>
            </Select>
            {role === "COMPTABLE" ? <p className="text-xs text-muted-foreground">{t("Un expert-comptable invité : il consulte la comptabilité (livres, balance, états financiers, TVA, exports) en lecture seule, sans rien voir d'autre ni rien modifier. Il ne compte pas parmi vos utilisateurs.")}</p> : null}
          </div>

          {role === "MANAGER" || role === "EMPLOYE" ? (
            <div className="flex flex-col gap-2">
              <Label>{t("Modules accessibles")}</Label>
              <input type="hidden" name="restreindreModules" value="1" />
              <SelecteurModules role={role} valeurs={modules} onChange={setModules} name="modules" />
            </div>
          ) : null}

          {role !== "COMPTABLE" ? (
            <>
          <div className="flex flex-col gap-2">
            <Label htmlFor="postePropose">{t("Poste")}</Label>
            <Input id="postePropose" name="postePropose" placeholder={t("Ex : Chargé de clientèle")} />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="typeContratPropose">{t("Type de contrat")}</Label>
            <Select id="typeContratPropose" name="typeContratPropose" value={contrat} onChange={(e) => setContrat(e.target.value)}>
              <option value="CDI">CDI</option>
              <option value="CDD">CDD</option>
              <option value="STAGE">{t("Stage professionnel (période probatoire)")}</option>
              <option value="PRESTATAIRE">{t("Prestataire")}</option>
            </Select>
            {contrat === "STAGE" ? <p className="text-xs text-muted-foreground">{t("Le stagiaire professionnel a un compte et un poste ; à la fin du stage, vous décidez de l'embaucher ou non. Pour un étudiant sans compte, utilisez plutôt « Stagiaire académique ».")}</p> : null}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="dateEmbauchePropose">{contrat === "STAGE" ? t("Début du stage") : t("Date d'embauche réelle")}</Label>
            <Input id="dateEmbauchePropose" name="dateEmbauchePropose" type="date" />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="dateNaissancePropose">{t("Date de naissance (facultatif)")}</Label>
            <Input id="dateNaissancePropose" name="dateNaissancePropose" type="date" />
          </div>

          {contrat === "STAGE" || contrat === "CDD" ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor="dateFinPropose">{contrat === "STAGE" ? t("Fin du stage") : t("Fin du CDD")}</Label>
              <Input id="dateFinPropose" name="dateFinPropose" type="date" required />
            </div>
          ) : null}

          <div className="flex flex-col gap-2">
            <Label htmlFor="managerPropose">{t("Manager (optionnel)")}</Label>
            <SelecteurPersonne id="managerPropose" name="managerPropose" personnes={collegues} placeholder={t("Rechercher un manager…")} />
          </div>
            </>
          ) : null}

          {etat?.erreur ? <p className="text-sm text-destructive">{etat.erreur}</p> : null}
          {etat?.succes ? (
            <p className="flex items-center gap-1.5 text-sm text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="size-4" aria-hidden />
              {etat.succes}
            </p>
          ) : null}

          <Button type="submit" disabled={enCours} className="self-start">
            {enCours ? <Spinner /> : <Send data-icon="inline-start" aria-hidden />}
            {enCours ? t("Envoi…") : t("Inviter")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
