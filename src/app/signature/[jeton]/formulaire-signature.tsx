"use client";

import { useActionState, useState } from "react";
import { Mail, PenLine, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { envoyerCodeVerificationSignature, confirmerSignature, refuserSignature } from "@/lib/actions/signature";
import { CodeVerification } from "@/components/formulaire/code-verification";
import { EcranPaiementReussi } from "@/components/formulaire/ecrans-paiement";
import { EtapesClient } from "@/components/formulaire/parcours-client";

/** Refus de signer : un motif facultatif, sans code de vérification. */
function FormulaireRefus({ jeton }: { jeton: string }) {
  const [etat, action, enCours] = useActionState(refuserSignature, null);
  const [ouvert, setOuvert] = useState(false);

  if (etat?.succes) {
    return <p className="text-sm text-muted-foreground">Votre refus a bien été transmis. Vous pouvez fermer cette page.</p>;
  }

  if (!ouvert) {
    return (
      <button type="button" className="w-fit text-sm text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground" onClick={() => setOuvert(true)}>
        Je ne souhaite pas signer
      </button>
    );
  }

  return (
    <form action={action} className="flex animate-in flex-col gap-3 rounded-2xl border border-border p-4 duration-300 fade-in slide-in-from-top-1">
      <input type="hidden" name="jeton" value={jeton} />
      <label htmlFor="motif" className="text-sm font-medium">
        Pourquoi refusez-vous de signer ? <span className="font-normal text-muted-foreground">(facultatif)</span>
      </label>
      <textarea id="motif" name="motif" rows={3} maxLength={1000} className="w-full resize-none rounded-xl border border-input bg-background p-3.5 text-base outline-none transition-all hover:border-primary/40 focus:border-primary focus:ring-4 focus:ring-primary/15" />
      {etat?.erreur ? (
        <p role="alert" className="text-sm text-destructive">
          {etat.erreur}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" variant="destructive" size="lg" className="h-11" disabled={enCours}>
          {enCours ? <Spinner /> : null}
          Confirmer mon refus
        </Button>
        <Button type="button" variant="ghost" size="lg" className="h-11" onClick={() => setOuvert(false)}>
          Annuler
        </Button>
      </div>
    </form>
  );
}

export function FormulaireSignature({ jeton, emailConnu }: { jeton: string; emailConnu: boolean }) {
  const [etatEnvoi, actionEnvoi, envoiEnCours] = useActionState(envoyerCodeVerificationSignature, null);
  const [etatConfirmation, actionConfirmation, confirmationEnCours] = useActionState(confirmerSignature, null);
  const [code, setCode] = useState("");

  if (etatConfirmation?.succes) {
    return <EcranPaiementReussi titre="Document signé avec succès" texte="Merci — une copie signée vous est envoyée par email." />;
  }

  if (!emailConnu) {
    return (
      <p role="alert" className="rounded-2xl bg-destructive/10 p-4 text-sm text-destructive">
        Aucune adresse email enregistrée pour recevoir le code de vérification — contactez l&apos;entreprise qui vous a envoyé ce lien.
      </p>
    );
  }

  if (!etatEnvoi?.succes) {
    return (
      <div className="flex animate-in flex-col gap-5 duration-500 fade-in slide-in-from-bottom-2">
        <EtapesClient etapes={["Vérifier", "Signer"]} active={0} />
        <form action={actionEnvoi} className="flex flex-col gap-4 rounded-2xl border border-border bg-muted/30 p-4 sm:p-5">
          <input type="hidden" name="jeton" value={jeton} />
          <div className="flex items-start gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <ShieldCheck className="size-5" aria-hidden />
            </span>
            <div>
              <h2 className="text-base font-semibold">Confirmons votre identité</h2>
              <p className="text-sm text-muted-foreground">Un code de vérification vous sera envoyé par email avant la signature.</p>
            </div>
          </div>
          {etatEnvoi?.erreur ? (
            <p role="alert" className="text-sm text-destructive">
              {etatEnvoi.erreur}
            </p>
          ) : null}
          <Button type="submit" size="lg" disabled={envoiEnCours} className="h-12 w-full text-base">
            {envoiEnCours ? <Spinner data-icon="inline-start" /> : <Mail data-icon="inline-start" aria-hidden />}
            {envoiEnCours ? "Envoi…" : "Recevoir mon code de vérification"}
          </Button>
        </form>
        <FormulaireRefus jeton={jeton} />
      </div>
    );
  }

  return (
    <div className="flex animate-in flex-col gap-5 duration-500 fade-in slide-in-from-right-3">
      <EtapesClient etapes={["Vérifier", "Signer"]} active={1} />
      <form action={actionConfirmation} className="flex flex-col gap-5 rounded-2xl border border-border bg-muted/30 p-4 sm:p-5">
        <input type="hidden" name="jeton" value={jeton} />

        <p className="flex items-start gap-2 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
          <Mail className="mt-0.5 size-4 shrink-0" aria-hidden />
          {etatEnvoi.succes}
        </p>

        <CodeVerification nom="code" etiquette="Code de vérification reçu par email" valeur={code} onChange={setCode} />

        <label htmlFor="consentement" className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-background p-3.5 text-sm transition-colors has-[:checked]:border-primary has-[:checked]:bg-primary/5">
          <input type="checkbox" id="consentement" name="consentement" required className="mt-0.5 size-5 shrink-0 accent-primary" />
          <span>Je consens à signer électroniquement ce document et reconnais que cette signature a la même valeur qu&apos;une signature manuscrite.</span>
        </label>

        {etatConfirmation?.erreur ? (
          <p role="alert" className="text-sm text-destructive">
            {etatConfirmation.erreur}
          </p>
        ) : null}

        <Button type="submit" size="lg" disabled={confirmationEnCours || code.replace(/\D/g, "").length < 6} className="h-12 w-full text-base">
          {confirmationEnCours ? <Spinner data-icon="inline-start" /> : <PenLine data-icon="inline-start" aria-hidden />}
          {confirmationEnCours ? "Signature…" : "Signer le document"}
        </Button>
      </form>
      <FormulaireRefus jeton={jeton} />
    </div>
  );
}
