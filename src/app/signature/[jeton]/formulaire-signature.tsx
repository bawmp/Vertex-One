"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { envoyerCodeVerificationSignature, confirmerSignature, refuserSignature } from "@/lib/actions/signature";

/** Refus de signer : un motif facultatif, sans code de vérification. */
function FormulaireRefus({ jeton }: { jeton: string }) {
  const [etat, action, enCours] = useActionState(refuserSignature, null);
  const [ouvert, setOuvert] = useState(false);

  if (etat?.succes) {
    return <p className="text-sm text-muted-foreground">Votre refus a bien été transmis. Vous pouvez fermer cette page.</p>;
  }

  if (!ouvert) {
    return (
      <button type="button" className="w-fit text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground" onClick={() => setOuvert(true)}>
        Je ne souhaite pas signer
      </button>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-2 rounded-lg border border-border p-3">
      <input type="hidden" name="jeton" value={jeton} />
      <Label htmlFor="motif">Pourquoi refusez-vous de signer ? (facultatif)</Label>
      <Textarea id="motif" name="motif" rows={3} maxLength={1000} />
      {etat?.erreur ? <p className="text-sm text-destructive">{etat.erreur}</p> : null}
      <div className="flex gap-2">
        <Button type="submit" variant="destructive" size="sm" disabled={enCours}>
          {enCours ? <Spinner /> : null}
          Confirmer mon refus
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOuvert(false)}>
          Annuler
        </Button>
      </div>
    </form>
  );
}

export function FormulaireSignature({ jeton, emailConnu }: { jeton: string; emailConnu: boolean }) {
  const [etatEnvoi, actionEnvoi, envoiEnCours] = useActionState(envoyerCodeVerificationSignature, null);
  const [etatConfirmation, actionConfirmation, confirmationEnCours] = useActionState(confirmerSignature, null);

  if (etatConfirmation?.succes) {
    return <p className="text-sm text-emerald-700">Document signé avec succès. Merci — une copie signée vous est envoyée par email.</p>;
  }

  if (!emailConnu) {
    return (
      <p className="text-sm text-destructive">
        Aucune adresse email enregistrée pour recevoir le code de vérification — contactez l&apos;entreprise qui vous a
        envoyé ce lien.
      </p>
    );
  }

  if (!etatEnvoi?.succes) {
    return (
      <div className="flex flex-col gap-4">
        <form action={actionEnvoi} className="flex flex-col gap-4">
          <input type="hidden" name="jeton" value={jeton} />
          <p className="text-sm text-muted-foreground">
            Un code de vérification vous sera envoyé par email pour confirmer votre identité avant la signature.
          </p>
          {etatEnvoi?.erreur ? <p className="text-sm text-destructive">{etatEnvoi.erreur}</p> : null}
          <Button type="submit" disabled={envoiEnCours} className="w-full">
            {envoiEnCours ? <Spinner /> : null}
            {envoiEnCours ? "Envoi…" : "Recevoir mon code de vérification"}
          </Button>
        </form>
        <FormulaireRefus jeton={jeton} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <form action={actionConfirmation} className="flex flex-col gap-4">
        <input type="hidden" name="jeton" value={jeton} />

        <p className="text-sm text-emerald-700">{etatEnvoi.succes}</p>

        <div className="flex flex-col gap-2">
          <Label htmlFor="code">Code de vérification reçu par email</Label>
          <Input id="code" name="code" inputMode="numeric" maxLength={6} required />
        </div>

        <div className="flex items-start gap-2">
          <input
            type="checkbox"
            id="consentement"
            name="consentement"
            required
            className="mt-1 size-4 shrink-0 rounded border-input"
          />
          <Label htmlFor="consentement" className="text-sm font-normal">
            Je consens à signer électroniquement ce document et reconnais que cette signature a la même valeur qu&apos;une
            signature manuscrite.
          </Label>
        </div>

        {etatConfirmation?.erreur ? <p className="text-sm text-destructive">{etatConfirmation.erreur}</p> : null}

        <Button type="submit" disabled={confirmationEnCours} className="w-full">
          {confirmationEnCours ? <Spinner /> : null}
          {confirmationEnCours ? "Signature…" : "Signer le document"}
        </Button>
      </form>
      <FormulaireRefus jeton={jeton} />
    </div>
  );
}
