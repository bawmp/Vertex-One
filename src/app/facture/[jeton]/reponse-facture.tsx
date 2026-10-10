"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Clock, CreditCard, MessageCircleWarning, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { payerFacturePublic, repondreFacturePublic } from "@/lib/actions/client-documents";
import { BoutonDecision } from "@/components/formulaire/parcours-client";
import { BandeauPaiementSecurise, RecapMontant } from "@/components/formulaire/ecrans-paiement";

export function ReponseFacture({ jeton, reponse, nomEntreprise, montant, numero }: { jeton: string; reponse: "ACCEPTEE" | "CONTESTEE" | null; nomEntreprise: string; montant: string; numero: string }) {
  const router = useRouter();
  const [enCours, startTransition] = useTransition();
  const [contestation, setContestation] = useState(false);
  const [motif, setMotif] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [plusTard, setPlusTard] = useState(false);
  const [action, setAction] = useState<"accepter" | "payer" | null>(null);

  function repondre(decision: "ACCEPTER" | "CONTESTER") {
    setErreur(null);
    setAction("accepter");
    startTransition(async () => {
      const resultat = await repondreFacturePublic(jeton, decision, decision === "CONTESTER" ? motif : undefined);
      if (resultat?.erreur) {
        setAction(null);
        return setErreur(resultat.erreur);
      }
      router.refresh();
    });
  }

  function payer() {
    setErreur(null);
    setAction("payer");
    startTransition(async () => {
      const resultat = await payerFacturePublic(jeton);
      if (resultat.url) {
        window.location.href = resultat.url;
        return;
      }
      setAction(null);
      setErreur(resultat.erreur ?? "Le paiement en ligne n'a pas pu être lancé.");
    });
  }

  if (reponse === "CONTESTEE") {
    return (
      <p className="flex animate-in items-start gap-3 rounded-2xl bg-amber-50 p-4 text-sm text-amber-900 duration-500 fade-in dark:bg-amber-950/40 dark:text-amber-200">
        <MessageCircleWarning className="mt-0.5 size-5 shrink-0" aria-hidden />
        <span>Votre contestation a été transmise à {nomEntreprise}, qui va vous recontacter. Le règlement est suspendu d&apos;ici là.</span>
      </p>
    );
  }

  if (reponse === "ACCEPTEE") {
    return (
      <section aria-labelledby="titre-reglement" className="flex animate-in flex-col gap-4 rounded-2xl border border-border bg-muted/30 p-4 duration-500 fade-in slide-in-from-bottom-2 sm:p-5">
        <div>
          <h2 id="titre-reglement" className="text-base font-semibold">
            Régler cette facture
          </h2>
          <p className="text-sm text-muted-foreground">Mobile Money ou carte, en quelques secondes.</p>
        </div>
        <RecapMontant etiquette="Montant à régler" designation={`Facture ${numero}`} montant={montant} />
        <div className="grid gap-3 sm:grid-cols-2">
          <BoutonDecision principal icone={CreditCard} titre="Payer maintenant" detail="Vous êtes redirigé vers le paiement sécurisé" chargement={enCours && action === "payer"} disabled={enCours} onClick={payer} />
          <BoutonDecision icone={Clock} titre="Payer plus tard" detail="Ce lien reste valable jusqu'à l'échéance" disabled={enCours} onClick={() => setPlusTard(true)} />
        </div>
        {enCours && action === "payer" ? <p className="animate-in text-center text-sm text-muted-foreground fade-in">Ouverture du paiement sécurisé…</p> : null}
        <BandeauPaiementSecurise libelle="Paiement sécurisé" moyens={["Mobile Money", "Carte bancaire", "Aangaraa Pay"]} />
        {plusTard ? <p className="animate-in rounded-xl bg-background p-3 text-sm shadow-xs duration-300 fade-in slide-in-from-top-1">Pas de problème : vous pouvez régler cette facture à tout moment depuis ce lien, avant son échéance.</p> : null}
        {erreur ? (
          <p role="alert" className="text-sm text-destructive">
            {erreur}
          </p>
        ) : null}
      </section>
    );
  }

  return (
    <section aria-labelledby="titre-reponse" className="flex animate-in flex-col gap-4 rounded-2xl border border-border bg-muted/30 p-4 duration-500 fade-in slide-in-from-bottom-2 sm:p-5">
      <div>
        <h2 id="titre-reponse" className="text-base font-semibold">
          Que décidez-vous ?
        </h2>
        <p className="text-sm text-muted-foreground">Acceptez la facture pour la régler, ou signalez un problème.</p>
      </div>
      {contestation ? (
        <div className="flex animate-in flex-col gap-3 duration-300 fade-in slide-in-from-right-2">
          <label htmlFor="motif" className="text-sm font-medium">
            Quel est le problème avec cette facture ?
          </label>
          <textarea
            id="motif"
            value={motif}
            onChange={(e) => setMotif(e.target.value)}
            rows={3}
            maxLength={1000}
            placeholder="Montant, prestation non réalisée, erreur sur mes coordonnées…"
            className="w-full resize-none rounded-xl border border-input bg-background p-3.5 text-base outline-none transition-all hover:border-primary/40 focus:border-primary focus:ring-4 focus:ring-primary/15"
          />
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="destructive" size="lg" className="h-11" disabled={enCours || !motif.trim()} onClick={() => repondre("CONTESTER")}>
              {enCours ? <Spinner /> : <X data-icon="inline-start" aria-hidden />}
              Envoyer ma contestation
            </Button>
            <Button type="button" variant="ghost" size="lg" className="h-11" disabled={enCours} onClick={() => setContestation(false)}>
              Retour
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <BoutonDecision principal icone={Check} titre="Accepter la facture" detail="Puis payer maintenant ou plus tard" chargement={enCours && action === "accepter"} disabled={enCours} onClick={() => repondre("ACCEPTER")} />
          <BoutonDecision icone={X} titre="Contester" detail="Vous pourrez expliquer le problème" disabled={enCours} onClick={() => setContestation(true)} />
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
