import { Card } from "@/components/ui/card";
import { calculerResultatsQuestion, SEUIL_MIN_PARTICIPANTS_POUR_RESULTATS } from "@/lib/rh/sondage";

type Question = { id: string; libelle: string; type: "NPS" | "ETOILES" | "TEXTE"; valeurs: string[] };

export function ResultatsSondage({ questions }: { questions: Question[] }) {
  return (
    <div className="flex flex-col gap-3">
      {questions.map((q, index) => {
        const resultat = calculerResultatsQuestion(q.type, q.valeurs);
        return (
          <Card
            key={q.id}
            style={{ animationDelay: `${Math.min(index, 8) * 30}ms` }}
            className="animate-in fade-in slide-in-from-bottom-1 p-4 duration-300 fill-mode-both"
          >
            <p className="mb-2 text-sm font-medium">{q.libelle}</p>
            {resultat.type === "TEXTE" ? (
              resultat.reponses.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucune réponse.</p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {resultat.reponses.map((r, i) => (
                    <li key={i} className="rounded bg-muted/50 px-2.5 py-1.5 text-sm text-muted-foreground">
                      {r}
                    </li>
                  ))}
                </ul>
              )
            ) : resultat.nombreReponses < SEUIL_MIN_PARTICIPANTS_POUR_RESULTATS ? (
              <p className="text-sm text-muted-foreground">
                Pas assez de réponses pour afficher un résultat ({resultat.nombreReponses}/{SEUIL_MIN_PARTICIPANTS_POUR_RESULTATS} minimum, pour préserver l&apos;anonymat).
              </p>
            ) : resultat.type === "NPS" ? (
              <p className="text-2xl font-semibold tracking-tight">
                {resultat.scoreENPS > 0 ? "+" : ""}
                {resultat.scoreENPS} <span className="text-sm font-normal text-muted-foreground">eNPS ({resultat.nombreReponses} réponses)</span>
              </p>
            ) : (
              <p className="text-2xl font-semibold tracking-tight">
                {resultat.moyenne} / 5 <span className="text-sm font-normal text-muted-foreground">({resultat.nombreReponses} réponses)</span>
              </p>
            )}
          </Card>
        );
      })}
    </div>
  );
}
