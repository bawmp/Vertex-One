"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, CreditCard, Clock, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { payerFacturePublic, repondreFacturePublic } from "@/lib/actions/client-documents";

export function ReponseFacture({ jeton, reponse, nomEntreprise }: { jeton: string; reponse: "ACCEPTEE" | "CONTESTEE" | null; nomEntreprise: string }) {
  const router = useRouter();
  const [enCours, startTransition] = useTransition();
  const [contestation, setContestation] = useState(false);
  const [motif, setMotif] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [plusTard, setPlusTard] = useState(false);

  function repondre(decision: "ACCEPTER" | "CONTESTER") {
    setErreur(null);
    startTransition(async () => {
      const resultat = await repondreFacturePublic(jeton, decision, decision === "CONTESTER" ? motif : undefined);
      if (resultat?.erreur) return setErreur(resultat.erreur);
      router.refresh();
    });
  }

  function payer() {
    setErreur(null);
    startTransition(async () => {
      const resultat = await payerFacturePublic(jeton);
      if (resultat.url) {
        window.location.href = resultat.url;
        return;
      }
      setErreur(resultat.erreur ?? "Le paiement en ligne n'a pas pu être lancé.");
    });
  }

  if (reponse === "CONTESTEE") {
    return <p className="rounded-lg bg-amber-50 p-4 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">Votre contestation a été transmise à {nomEntreprise}, qui va vous recontacter. Le règlement est suspendu d&apos;ici là.</p>;
  }

  if (reponse === "ACCEPTEE") {
    return (
      <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
        <p className="text-sm font-medium">Régler cette facture</p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" disabled={enCours} onClick={payer}>
            {enCours ? <Spinner /> : <CreditCard data-icon="inline-start" aria-hidden />}
            Payer maintenant
          </Button>
          <Button type="button" variant="outline" disabled={enCours} onClick={() => setPlusTard(true)}>
            <Clock data-icon="inline-start" aria-hidden />
            Payer plus tard
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">Paiement par Mobile Money, traité par CinetPay.</p>
        {plusTard ? <p className="rounded-md bg-muted p-3 text-sm">Pas de problème : vous pouvez régler cette facture à tout moment depuis ce lien, avant son échéance.</p> : null}
        {erreur ? <p className="text-sm text-destructive">{erreur}</p> : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
      <p className="text-sm font-medium">Votre réponse</p>
      {contestation ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor="motif">Quel est le problème avec cette facture ?</Label>
          <Textarea id="motif" value={motif} onChange={(e) => setMotif(e.target.value)} rows={3} maxLength={1000} placeholder="Montant, prestation non réalisée, erreur sur mes coordonnées…" />
          <div className="flex gap-2">
            <Button type="button" variant="destructive" disabled={enCours || !motif.trim()} onClick={() => repondre("CONTESTER")}>
              {enCours ? <Spinner /> : <X data-icon="inline-start" aria-hidden />}
              Envoyer ma contestation
            </Button>
            <Button type="button" variant="ghost" disabled={enCours} onClick={() => setContestation(false)}>
              Retour
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button type="button" disabled={enCours} onClick={() => repondre("ACCEPTER")}>
            {enCours ? <Spinner /> : <Check data-icon="inline-start" aria-hidden />}
            Accepter la facture
          </Button>
          <Button type="button" variant="outline" disabled={enCours} onClick={() => setContestation(true)}>
            <X data-icon="inline-start" aria-hidden />
            Contester
          </Button>
        </div>
      )}
      {erreur ? <p className="text-sm text-destructive">{erreur}</p> : null}
    </div>
  );
}
