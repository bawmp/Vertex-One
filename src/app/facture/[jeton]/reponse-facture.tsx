"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Clock, CreditCard, MessageCircleWarning, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { payerFacturePublic, recupererPaiementFactureEnAttentePublic, repondreFacturePublic, verifierPaiementFacturePublic } from "@/lib/actions/client-documents";
import { BoutonDecision } from "@/components/formulaire/parcours-client";
import { PaiementMobileMoney } from "@/components/formulaire/paiement-mobile-money";

export function ReponseFacture({ jeton, reponse, nomEntreprise, solde, dejaPaye, tranchesAutorisees, numero }: { jeton: string; reponse: "ACCEPTEE" | "CONTESTEE" | null; nomEntreprise: string; solde: number; dejaPaye: number; tranchesAutorisees: boolean; numero: string }) {
  const router = useRouter();
  const [enCours, startTransition] = useTransition();
  const [contestation, setContestation] = useState(false);
  const [motif, setMotif] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [plusTard, setPlusTard] = useState(false);
  const [action, setAction] = useState<"accepter" | null>(null);
  const [paiementOuvert, setPaiementOuvert] = useState(false);

  // Retour sur la page pendant qu'un paiement attend la validation du téléphone (onglet rechargé) : le suivi reprend tout seul.
  useEffect(() => {
    if (reponse !== "ACCEPTEE") return;
    let annule = false;
    recupererPaiementFactureEnAttentePublic(jeton).then((enAttente) => {
      if (!annule && enAttente) setPaiementOuvert(true);
    });
    return () => {
      annule = true;
    };
  }, [jeton, reponse]);

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
          <p className="text-sm text-muted-foreground">{tranchesAutorisees ? "Par Mobile Money (MTN ou Orange), en une fois ou par tranches." : "Par Mobile Money (MTN ou Orange), depuis votre téléphone."}</p>
        </div>
        {paiementOuvert ? (
          <PaiementMobileMoney
            etiquette="Montant à régler"
            designation={`Facture ${numero}`}
            solde={solde}
            dejaPaye={dejaPaye}
            tranchesAutorisees={tranchesAutorisees}
            declencher={(telephone, operateur, montant) => payerFacturePublic(jeton, telephone, operateur, montant)}
            verifier={(tentativeId) => verifierPaiementFacturePublic(jeton, tentativeId)}
            reprendre={() => recupererPaiementFactureEnAttentePublic(jeton)}
            onConfirme={() => router.refresh()}
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <BoutonDecision principal icone={CreditCard} titre="Payer maintenant" detail={tranchesAutorisees && solde > 1000 ? "Tout le solde ou une tranche de votre choix, par Mobile Money" : "Mobile Money : une demande de validation arrive sur votre téléphone"} onClick={() => setPaiementOuvert(true)} />
            <BoutonDecision icone={Clock} titre="Payer plus tard" detail="Ce lien reste valable jusqu'à l'échéance" onClick={() => setPlusTard(true)} />
          </div>
        )}
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
