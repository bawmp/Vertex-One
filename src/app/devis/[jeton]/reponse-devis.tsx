"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { repondreDevisPublic } from "@/lib/actions/client-documents";
import { BoutonDecision } from "@/components/formulaire/parcours-client";
import { EcranPaiementReussi } from "@/components/formulaire/ecrans-paiement";

export function ReponseDevis({ jeton }: { jeton: string }) {
  const router = useRouter();
  const [enCours, startTransition] = useTransition();
  const [refus, setRefus] = useState(false);
  const [motif, setMotif] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [merci, setMerci] = useState<string | null>(null);
  const [choix, setChoix] = useState<"ACCEPTER" | "REFUSER" | null>(null);

  function repondre(decision: "ACCEPTER" | "REFUSER") {
    setErreur(null);
    setChoix(decision);
    startTransition(async () => {
      const resultat = await repondreDevisPublic(jeton, decision, decision === "REFUSER" ? motif : undefined);
      if (resultat?.erreur) {
        setChoix(null);
        return setErreur(resultat.erreur);
      }
      // Devis accepté : direction la facture, à régler maintenant ou plus tard.
      if (resultat?.factureJeton) return router.push(`/facture/${resultat.factureJeton}?apres=devis`);
      setMerci(resultat?.succes ?? "Merci pour votre réponse.");
      router.refresh();
    });
  }

  if (merci) return <EcranPaiementReussi titre={merci} />;

  return (
    <section aria-labelledby="titre-reponse" className="flex animate-in flex-col gap-4 rounded-2xl border border-border bg-muted/30 p-4 duration-500 fade-in slide-in-from-bottom-2 sm:p-5">
      <div>
        <h2 id="titre-reponse" className="text-base font-semibold">
          Que décidez-vous ?
        </h2>
        <p className="text-sm text-muted-foreground">Votre réponse est transmise tout de suite à l&apos;entreprise.</p>
      </div>

      {refus ? (
        <div className="flex animate-in flex-col gap-3 duration-300 fade-in slide-in-from-right-2">
          <label htmlFor="motif" className="text-sm font-medium">
            Pourquoi refusez-vous ce devis ? <span className="font-normal text-muted-foreground">(facultatif)</span>
          </label>
          <textarea
            id="motif"
            value={motif}
            onChange={(e) => setMotif(e.target.value)}
            rows={3}
            maxLength={1000}
            placeholder="Prix, délai, besoin qui a changé…"
            className="w-full resize-none rounded-xl border border-input bg-background p-3.5 text-base outline-none transition-all hover:border-primary/40 focus:border-primary focus:ring-4 focus:ring-primary/15"
          />
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="destructive" size="lg" className="h-11" disabled={enCours} onClick={() => repondre("REFUSER")}>
              {enCours ? <Spinner /> : <X data-icon="inline-start" aria-hidden />}
              Confirmer le refus
            </Button>
            <Button type="button" variant="ghost" size="lg" className="h-11" disabled={enCours} onClick={() => setRefus(false)}>
              Retour
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <BoutonDecision principal icone={Check} titre="Accepter le devis" detail="Votre facture est créée aussitôt" chargement={enCours && choix === "ACCEPTER"} disabled={enCours} onClick={() => repondre("ACCEPTER")} />
          <BoutonDecision icone={X} titre="Refuser" detail="Vous pourrez expliquer pourquoi" disabled={enCours} onClick={() => setRefus(true)} />
        </div>
      )}
      {erreur ? (
        <p role="alert" className="text-sm text-destructive">
          {erreur}
        </p>
      ) : null}
    </section>
  );
}
