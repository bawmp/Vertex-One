"use client";

import { useActionState, useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { creerSondage } from "@/lib/actions/sondage";

type Question = { libelle: string; type: "NPS" | "ETOILES" | "TEXTE" };
const QUESTION_VIDE: Question = { libelle: "", type: "NPS" };

export function FormulaireNouveauSondage() {
  const [etat, action, enCours] = useActionState(creerSondage, null);
  const [ouvert, setOuvert] = useState(false);
  const [questions, setQuestions] = useState<Question[]>([{ ...QUESTION_VIDE }]);

  function majQuestion(index: number, champ: keyof Question, valeur: string) {
    setQuestions((precedent) => precedent.map((q, i) => (i === index ? { ...q, [champ]: valeur } : q)));
  }

  if (!ouvert) {
    return (
      <Button size="sm" onClick={() => setOuvert(true)}>
        <Plus data-icon="inline-start" aria-hidden />
        Nouveau sondage
      </Button>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Nouveau sondage</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={action} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <Label htmlFor="titre">Titre</Label>
            <Input id="titre" name="titre" required placeholder="Ex. Satisfaction — automne 2026" />
          </div>

          <div className="flex flex-col gap-2">
            {questions.map((question, index) => (
              <div key={index} className="grid grid-cols-[1fr_10rem_auto] items-end gap-2">
                <div className="flex flex-col gap-1">
                  {index === 0 ? <Label>Question</Label> : null}
                  <Input name="libelle" required value={question.libelle} onChange={(e) => majQuestion(index, "libelle", e.target.value)} />
                </div>
                <div className="flex flex-col gap-1">
                  {index === 0 ? <Label>Type</Label> : null}
                  <Select name="type" value={question.type} onChange={(e) => majQuestion(index, "type", e.target.value)}>
                    <option value="NPS">Score 0-10 (eNPS)</option>
                    <option value="ETOILES">Étoiles 1-5</option>
                    <option value="TEXTE">Texte libre</option>
                  </Select>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={questions.length === 1}
                  onClick={() => setQuestions((p) => p.filter((_, i) => i !== index))}
                  aria-label="Retirer la question"
                  className="text-muted-foreground hover:text-destructive"
                >
                  <X className="size-4" aria-hidden />
                </Button>
              </div>
            ))}

            <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => setQuestions((p) => [...p, { ...QUESTION_VIDE }])}>
              <Plus data-icon="inline-start" aria-hidden />
              Ajouter une question
            </Button>
          </div>

          {etat?.erreur ? <p className="text-sm text-destructive">{etat.erreur}</p> : null}

          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={enCours}>
              {enCours ? <Spinner /> : null}
              {enCours ? "Création…" : "Créer (brouillon)"}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setOuvert(false)}>
              Annuler
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
