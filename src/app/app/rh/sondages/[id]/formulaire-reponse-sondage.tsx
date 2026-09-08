"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { repondreSondage } from "@/lib/actions/sondage";

type Question = { id: string; libelle: string; type: string };

export function FormulaireReponseSondage({ sondageId, questions }: { sondageId: string; questions: Question[] }) {
  const [etat, action, enCours] = useActionState(repondreSondage.bind(null, sondageId), null);

  return (
    <form action={action} className="flex flex-col gap-4 rounded-lg border p-4">
      {questions.map((q) => (
        <div key={q.id} className="flex flex-col gap-2">
          <Label htmlFor={`question-${q.id}`}>{q.libelle}</Label>
          {q.type === "TEXTE" ? (
            <Textarea id={`question-${q.id}`} name={`question-${q.id}`} rows={3} />
          ) : (
            <Select id={`question-${q.id}`} name={`question-${q.id}`} defaultValue="" className="max-w-40">
              <option value="">Sans réponse</option>
              {Array.from({ length: q.type === "NPS" ? 11 : 5 }, (_, i) => (q.type === "NPS" ? i : i + 1)).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </Select>
          )}
        </div>
      ))}

      {etat?.erreur ? <p className="text-sm text-destructive">{etat.erreur}</p> : null}

      <Button type="submit" size="sm" disabled={enCours} className="self-start">
        {enCours ? <Spinner /> : null}
        {enCours ? "Envoi…" : "Envoyer mes réponses"}
      </Button>
      <p className="text-xs text-muted-foreground">Vos réponses restent anonymes — aucun lien n&apos;est conservé entre vous et vos réponses.</p>
    </form>
  );
}
