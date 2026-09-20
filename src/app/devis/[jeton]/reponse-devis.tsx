"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { repondreDevisPublic } from "@/lib/actions/client-documents";

export function ReponseDevis({ jeton }: { jeton: string }) {
  const router = useRouter();
  const [enCours, startTransition] = useTransition();
  const [refus, setRefus] = useState(false);
  const [motif, setMotif] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [merci, setMerci] = useState<string | null>(null);

  function repondre(decision: "ACCEPTER" | "REFUSER") {
    setErreur(null);
    startTransition(async () => {
      const resultat = await repondreDevisPublic(jeton, decision, decision === "REFUSER" ? motif : undefined);
      if (resultat?.erreur) return setErreur(resultat.erreur);
      // Devis accepté : direction la facture, à régler maintenant ou plus tard.
      if (resultat?.factureJeton) return router.push(`/facture/${resultat.factureJeton}?apres=devis`);
      setMerci(resultat?.succes ?? "Merci pour votre réponse.");
      router.refresh();
    });
  }

  if (merci) return <p className="rounded-lg bg-muted p-4 text-sm">{merci}</p>;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
      <p className="text-sm font-medium">Votre réponse</p>
      {refus ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor="motif">Pourquoi refusez-vous ce devis ? (facultatif)</Label>
          <Textarea id="motif" value={motif} onChange={(e) => setMotif(e.target.value)} rows={3} maxLength={1000} placeholder="Prix, délai, besoin qui a changé…" />
          <div className="flex gap-2">
            <Button type="button" variant="destructive" disabled={enCours} onClick={() => repondre("REFUSER")}>
              {enCours ? <Spinner /> : <X data-icon="inline-start" aria-hidden />}
              Confirmer le refus
            </Button>
            <Button type="button" variant="ghost" disabled={enCours} onClick={() => setRefus(false)}>
              Retour
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button type="button" disabled={enCours} onClick={() => repondre("ACCEPTER")}>
            {enCours ? <Spinner /> : <Check data-icon="inline-start" aria-hidden />}
            Accepter le devis
          </Button>
          <Button type="button" variant="outline" disabled={enCours} onClick={() => setRefus(true)}>
            <X data-icon="inline-start" aria-hidden />
            Refuser
          </Button>
        </div>
      )}
      {erreur ? <p className="text-sm text-destructive">{erreur}</p> : null}
    </div>
  );
}
