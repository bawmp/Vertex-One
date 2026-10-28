"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarCheck, CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { promettrePaiementPublic } from "@/lib/actions/client-documents";
import { formaterFCFA } from "@/lib/facturation/calcul";
import { LONGUEUR_MAX_NOTE_PROMESSE } from "@/lib/facturation/promesse-regles";

const jourLisible = (jour: string) => new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${jour}T00:00:00Z`));

/**
 * « Payer plus tard » : le client indique la date à laquelle il réglera (« Je paierai le… »). Tant que cette date court, nous ne le
 * relançons pas automatiquement. S'il a déjà annoncé une date, elle s'affiche avec la possibilité de la changer. La date est
 * revérifiée côté serveur (entre demain et 60 jours) ; l'entreprise et la facture viennent du lien, jamais d'ici.
 */
export function PromesseClient({ jeton, promesse, jourMin, jourMax, nomEntreprise }: { jeton: string; promesse: { datePromise: string; montant: number } | null; jourMin: string; jourMax: string; nomEntreprise: string }) {
  const router = useRouter();
  const [edition, setEdition] = useState(!promesse);
  const [date, setDate] = useState(promesse?.datePromise ?? "");
  const [note, setNote] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, startTransition] = useTransition();

  function confirmer() {
    setErreur(null);
    startTransition(async () => {
      const resultat = await promettrePaiementPublic(jeton, date, note);
      if (resultat?.erreur) return setErreur(resultat.erreur);
      setEdition(false);
      setNote("");
      router.refresh();
    });
  }

  if (promesse && !edition) {
    return (
      <div className="flex animate-in flex-col gap-2 rounded-xl bg-background p-3.5 text-sm shadow-xs duration-300 fade-in slide-in-from-top-1" role="status">
        <p className="flex items-start gap-2">
          <CalendarCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
          <span>
            C&apos;est noté : vous avez annoncé que vous réglerez <strong>{formaterFCFA(promesse.montant)}</strong> le <strong>{jourLisible(promesse.datePromise)}</strong>. {nomEntreprise} ne vous relancera pas d&apos;ici là. Vous pouvez aussi payer maintenant, à tout moment.
          </span>
        </p>
        <Button type="button" variant="ghost" size="sm" className="self-start" onClick={() => setEdition(true)}>
          Changer la date
        </Button>
      </div>
    );
  }

  return (
    <div className="flex animate-in flex-col gap-3 rounded-xl bg-background p-3.5 text-sm shadow-xs duration-300 fade-in slide-in-from-top-1">
      <p className="flex items-start gap-2">
        <CalendarClock className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
        <span>Pas de problème. Indiquez la date à laquelle vous pensez régler cette facture : nous ne vous relancerons pas d&apos;ici là.</span>
      </p>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="date-promesse" className="font-medium">
          Je paierai le
        </label>
        <input
          id="date-promesse"
          type="date"
          value={date}
          min={jourMin}
          max={jourMax}
          onChange={(e) => setDate(e.target.value)}
          className="h-11 w-full max-w-56 rounded-xl border border-input bg-background px-3 text-base outline-none transition-all hover:border-primary/40 focus:border-primary focus:ring-4 focus:ring-primary/15"
        />
        <p className="text-xs text-muted-foreground">Une date à partir de demain, dans les 60 prochains jours.</p>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="note-promesse" className="font-medium">
          Un mot pour {nomEntreprise} (facultatif)
        </label>
        <textarea
          id="note-promesse"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          maxLength={LONGUEUR_MAX_NOTE_PROMESSE}
          placeholder="Ex. : je reçois mon salaire le 5."
          className="w-full resize-none rounded-xl border border-input bg-background p-3 text-base outline-none transition-all hover:border-primary/40 focus:border-primary focus:ring-4 focus:ring-primary/15"
        />
      </div>
      {erreur ? (
        <p role="alert" className="text-sm text-destructive">
          {erreur}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="lg" className="h-11" disabled={enCours || !date} onClick={confirmer}>
          {enCours ? <Spinner data-icon="inline-start" /> : <CalendarCheck data-icon="inline-start" aria-hidden />}
          Confirmer cette date
        </Button>
        {promesse ? (
          <Button type="button" variant="ghost" size="lg" className="h-11" disabled={enCours} onClick={() => setEdition(false)}>
            Annuler
          </Button>
        ) : null}
      </div>
    </div>
  );
}
