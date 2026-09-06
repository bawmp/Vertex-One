"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { creerReunionCrm } from "@/lib/actions/activite-crm";

type OptionRelation = { id: string; libelle: string };

export function FormulaireReunionCrm({
  leads,
  contacts,
  deals,
}: {
  leads: OptionRelation[];
  contacts: OptionRelation[];
  deals: OptionRelation[];
}) {
  const [etat, action, enCours] = useActionState(creerReunionCrm, null);
  const [typeRelation, setTypeRelation] = useState<"aucun" | "lead" | "contact" | "deal">("aucun");
  const [ouvert, setOuvert] = useState(false);
  const enCoursPrecedent = useRef(false);

  // Même détection que FormulaireTacheCrm : `etat` ne distingue pas "jamais
  // soumis" de "soumis avec succès" (même littéral `null`), donc on referme
  // le formulaire sur la transition true → false de `enCours` sans erreur.
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
        Nouvelle réunion
      </Button>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <Label htmlFor="titre">Titre</Label>
        <Input id="titre" name="titre" required minLength={2} placeholder="ex : Présentation de l'offre" />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="dateDebut">De</Label>
          <Input id="dateDebut" name="dateDebut" type="datetime-local" required />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="dateFin">Au</Label>
          <Input id="dateFin" name="dateFin" type="datetime-local" required />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="relatifAType">Relatif à</Label>
          <Select
            id="relatifAType"
            name="relatifAType"
            value={typeRelation}
            onChange={(e) => setTypeRelation(e.target.value as typeof typeRelation)}
          >
            <option value="aucun">Aucun</option>
            <option value="lead">Un lead</option>
            <option value="contact">Un contact</option>
            <option value="deal">Un deal</option>
          </Select>
        </div>
        {typeRelation !== "aucun" ? (
          <div className="flex flex-col gap-2">
            <Label htmlFor="relatifAId">&nbsp;</Label>
            <Select id="relatifAId" name="relatifAId" defaultValue="" required>
              <option value="" disabled>
                Choisir…
              </option>
              {optionsRelation.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.libelle}
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
          {enCours ? "Création…" : "Ajouter la réunion"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOuvert(false)}>
          Annuler
        </Button>
      </div>
    </form>
  );
}
