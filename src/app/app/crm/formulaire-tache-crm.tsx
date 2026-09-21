"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { creerTacheCrm } from "@/lib/actions/activite-crm";
import { useT } from "@/lib/i18n/contexte";

type OptionRelation = { id: string; libelle: string };

export function FormulaireTacheCrm({
  leads,
  contacts,
  deals,
}: {
  leads: OptionRelation[];
  contacts: OptionRelation[];
  deals: OptionRelation[];
}) {
  const t = useT();
  const [etat, action, enCours] = useActionState(creerTacheCrm, null);
  const [typeRelation, setTypeRelation] = useState<"aucun" | "lead" | "contact" | "deal">("aucun");
  const [ouvert, setOuvert] = useState(false);
  const enCoursPrecedent = useRef(false);

  // useActionState retourne le même littéral `null` en cas de succès qu'à
  // l'état initial — impossible de distinguer "jamais soumis" de "soumis
  // avec succès" via `etat` seul. On détecte plutôt la transition
  // true → false de `enCours` sans erreur, pour refermer le formulaire après
  // une création réussie (comme le fait la création rapide de Zoho).
  useEffect(() => {
    if (enCoursPrecedent.current && !enCours && !etat?.erreur) {
      setOuvert(false);
    }
    enCoursPrecedent.current = enCours;
  }, [enCours, etat]);

  const optionsRelation = typeRelation === "lead" ? leads : typeRelation === "contact" ? contacts : typeRelation === "deal" ? deals : [];

  if (!ouvert) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOuvert(true)}>
        <Plus data-icon="inline-start" aria-hidden />
        {t("Nouvelle tâche")}
      </Button>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <Label htmlFor="objet">{t("Objet")}</Label>
        <Input id="objet" name="objet" required minLength={2} placeholder={t("ex : Relance de paiement")} />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="dateEcheance">{t("Date d'échéance")}</Label>
          <Input id="dateEcheance" name="dateEcheance" type="date" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="priorite">{t("Priorité")}</Label>
          <Select id="priorite" name="priorite" defaultValue="NORMALE">
            <option value="BASSE">{t("Basse")}</option>
            <option value="NORMALE">{t("Normale")}</option>
            <option value="HAUTE">{t("Haute")}</option>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="relatifAType">{t("Relatif à")}</Label>
          <Select
            id="relatifAType"
            name="relatifAType"
            value={typeRelation}
            onChange={(e) => setTypeRelation(e.target.value as typeof typeRelation)}
          >
            <option value="aucun">{t("Aucun")}</option>
            <option value="lead">{t("Un lead")}</option>
            <option value="contact">{t("Un contact")}</option>
            <option value="deal">{t("Un deal")}</option>
          </Select>
        </div>
        {typeRelation !== "aucun" ? (
          <div className="flex flex-col gap-2">
            <Label htmlFor="relatifAId">&nbsp;</Label>
            <Select id="relatifAId" name="relatifAId" defaultValue="" required>
              <option value="" disabled>
                {t("Choisir…")}
              </option>
              {optionsRelation.map((option) => (
                <option key={option.id} value={option.id}>
                  {t(option.libelle)}
                </option>
              ))}
            </Select>
          </div>
        ) : null}
      </div>

      {etat?.erreur ? <p className="text-sm text-destructive">{etat.erreur}</p> : null}

      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={enCours}>
          {enCours ? <Spinner /> : null}
          {enCours ? t("Création…") : t("Ajouter la tâche")}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOuvert(false)}>
          {t("Annuler")}
        </Button>
      </div>
    </form>
  );
}
