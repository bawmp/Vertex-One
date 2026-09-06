"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { envoyerCodeVerificationSignature, confirmerSignature } from "@/lib/actions/signature";

export function FormulaireSignature({ jeton, emailConnu }: { jeton: string; emailConnu: boolean }) {
  const [etatEnvoi, actionEnvoi, envoiEnCours] = useActionState(envoyerCodeVerificationSignature, null);
  const [etatConfirmation, actionConfirmation, confirmationEnCours] = useActionState(confirmerSignature, null);

  if (etatConfirmation?.succes) {
    return <p className="text-sm text-emerald-700">Document signé avec succès. Merci.</p>;
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
    );
  }

  return (
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
  );
}
