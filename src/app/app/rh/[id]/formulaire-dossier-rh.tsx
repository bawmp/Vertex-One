"use client";

import { useActionState, useState } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { SelecteurPersonne, type PersonneSelectionnable } from "@/components/selecteur-personne";
import { modifierDossierRH } from "@/lib/actions/rh";
import { useT } from "@/lib/i18n/contexte";

function versDateInput(d: Date | null): string {
  return d ? d.toISOString().slice(0, 10) : "";
}

export function FormulaireDossierRH({
  dossierRHId,
  poste,
  typeContrat,
  dateEmbauche,
  dateFinContrat,
  nombrePersonnesACharge,
  managerId,
  serviceId,
  collegues,
  services,
  departementsAutorises,
}: {
  dossierRHId: string;
  poste: string;
  typeContrat: string;
  dateEmbauche: Date;
  dateFinContrat: Date | null;
  nombrePersonnesACharge: number;
  managerId: string | null;
  serviceId: string | null;
  collegues: PersonneSelectionnable[];
  services: { id: string; nom: string }[];
  /** Départements — autres que le sien — que cette personne peut voir en plus, en RH (accordé par l'Admin). */
  departementsAutorises: string[];
}) {
  const t = useT();
  const [etat, action, enCours] = useActionState(modifierDossierRH, null);
  const [ouvert, setOuvert] = useState(false);

  if (!ouvert) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOuvert(true)}>
        <Pencil data-icon="inline-start" aria-hidden />
        {t("Modifier")}
      </Button>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("Modifier le dossier RH")}</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={action} className="flex flex-col gap-4">
          <input type="hidden" name="dossierRHId" value={dossierRHId} />

          <div className="flex flex-col gap-2">
            <Label htmlFor="poste">{t("Poste")}</Label>
            <Input id="poste" name="poste" defaultValue={poste} required />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="typeContrat">{t("Type de contrat")}</Label>
              <Select id="typeContrat" name="typeContrat" defaultValue={typeContrat}>
                <option value="CDI">CDI</option>
                <option value="CDD">CDD</option>
                <option value="STAGE">{t("Stage")}</option>
                <option value="PRESTATAIRE">{t("Prestataire")}</option>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="nombrePersonnesACharge">{t("Personnes à charge")}</Label>
              <Input id="nombrePersonnesACharge" name="nombrePersonnesACharge" type="number" min={0} defaultValue={nombrePersonnesACharge} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="dateEmbauche">{t("Date d'embauche")}</Label>
              <Input id="dateEmbauche" name="dateEmbauche" type="date" defaultValue={versDateInput(dateEmbauche)} required />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="dateFinContrat">{t("Fin de contrat (si CDD)")}</Label>
              <Input id="dateFinContrat" name="dateFinContrat" type="date" defaultValue={versDateInput(dateFinContrat)} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="managerId">{t("Manager")}</Label>
              <SelecteurPersonne id="managerId" name="managerId" personnes={collegues} defaultValue={managerId} placeholder={t("Rechercher un manager…")} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="serviceId">{t("Département")}</Label>
              <Select id="serviceId" name="serviceId" defaultValue={serviceId ?? ""}>
                <option value="">{t("Aucun")}</option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>{s.nom}</option>
                ))}
              </Select>
            </div>
          </div>

          {services.filter((s) => s.id !== serviceId).length > 0 ? (
            <div className="flex flex-col gap-2">
              <Label>{t("Accès à d'autres départements (RH)")}</Label>
              <p className="text-xs text-muted-foreground">
                {t("En plus de son propre département et de son équipe, cette personne verra aussi les dossiers RH des départements cochés.")}
              </p>
              <div className="flex flex-col gap-1.5">
                {services
                  .filter((s) => s.id !== serviceId)
                  .map((s) => (
                    <label key={s.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        name="departementsAutorises"
                        value={s.id}
                        defaultChecked={departementsAutorises.includes(s.id)}
                        className="size-4 rounded border-input"
                      />
                      {s.nom}
                    </label>
                  ))}
              </div>
            </div>
          ) : null}

          {etat?.erreur ? <p className="text-sm text-destructive">{etat.erreur}</p> : null}

          <div className="flex gap-2">
            <Button type="submit" disabled={enCours}>
              {enCours ? <Spinner /> : null}
              {enCours ? t("Enregistrement…") : t("Enregistrer")}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setOuvert(false)}>
              {t("Annuler")}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
