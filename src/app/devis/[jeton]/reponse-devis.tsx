"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, X, MessageSquareText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { repondreDevisPublic, demanderRevisionDevisPublic } from "@/lib/actions/client-documents";
import { ARGUMENTS_MIN, ARGUMENTS_MAX, ARGUMENT_LONGUEUR_MAX, nettoyerArguments, erreurArguments } from "@/lib/facturation/revision-devis";
import { BoutonDecision } from "@/components/formulaire/parcours-client";
import { EcranPaiementReussi } from "@/components/formulaire/ecrans-paiement";

export function ReponseDevis({ jeton }: { jeton: string }) {
  const router = useRouter();
  const [enCours, startTransition] = useTransition();
  const [refus, setRefus] = useState(false);
  const [revision, setRevision] = useState(false);
  const [arguments_, setArguments] = useState<string[]>(Array.from({ length: ARGUMENTS_MIN }, () => ""));
  const [envoye, setEnvoye] = useState<string | null>(null);
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

  function demanderRevision() {
    setErreur(null);
    startTransition(async () => {
      const resultat = await demanderRevisionDevisPublic(jeton, arguments_);
      if (resultat?.erreur) return setErreur(resultat.erreur);
      setEnvoye(resultat?.succes ?? "Votre demande a été transmise.");
      setRevision(false);
      setArguments(Array.from({ length: ARGUMENTS_MIN }, () => ""));
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

      {envoye ? (
        <p role="status" className="rounded-xl bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
          {envoye}
        </p>
      ) : null}

      {revision ? (
        <div className="flex animate-in flex-col gap-3 duration-300 fade-in slide-in-from-right-2">
          <p className="text-sm font-medium">
            Avancez vos arguments <span className="font-normal text-muted-foreground">({ARGUMENTS_MIN} au moins, une phrase chacun : prix visé, délai souhaité, prestation à ajouter ou retirer…)</span>
          </p>
          <ol className="flex flex-col gap-2">
            {arguments_.map((a, i) => (
              <li key={i} className="flex items-start gap-2">
                <span aria-hidden className="mt-3 w-5 shrink-0 text-right text-sm text-muted-foreground tabular-nums">{i + 1}.</span>
                <textarea
                  aria-label={`Argument ${i + 1}`}
                  value={a}
                  onChange={(e) => setArguments((p) => p.map((x, j) => (j === i ? e.target.value : x)))}
                  rows={2}
                  maxLength={ARGUMENT_LONGUEUR_MAX}
                  className="w-full resize-none rounded-xl border border-input bg-background p-3 text-base outline-none transition-all hover:border-primary/40 focus:border-primary focus:ring-4 focus:ring-primary/15"
                />
                {i >= ARGUMENTS_MIN ? (
                  <Button type="button" variant="ghost" size="icon-sm" aria-label="Retirer cet argument" className="mt-1.5" onClick={() => setArguments((p) => p.filter((_, j) => j !== i))}>
                    <X aria-hidden />
                  </Button>
                ) : null}
              </li>
            ))}
          </ol>
          {arguments_.length < ARGUMENTS_MAX ? (
            <Button type="button" variant="outline" size="sm" className="self-start border-dashed" onClick={() => setArguments((p) => [...p, ""])}>
              Ajouter un argument
            </Button>
          ) : null}
          <p className="text-xs text-muted-foreground" aria-live="polite">
            {nettoyerArguments(arguments_).length} / {ARGUMENTS_MIN} arguments rédigés minimum
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="lg" className="h-11" disabled={enCours || erreurArguments(nettoyerArguments(arguments_)) !== null} onClick={demanderRevision}>
              {enCours ? <Spinner /> : <MessageSquareText data-icon="inline-start" aria-hidden />}
              Envoyer ma demande
            </Button>
            <Button type="button" variant="ghost" size="lg" className="h-11" disabled={enCours} onClick={() => setRevision(false)}>
              Retour
            </Button>
          </div>
        </div>
      ) : refus ? (
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
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <BoutonDecision principal icone={Check} titre="Accepter le devis" detail="Votre facture est créée aussitôt" chargement={enCours && choix === "ACCEPTER"} disabled={enCours} onClick={() => repondre("ACCEPTER")} />
          <BoutonDecision icone={MessageSquareText} titre="Demander une révision" detail="Expliquez ce que vous aimeriez changer" disabled={enCours} onClick={() => setRevision(true)} />
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
