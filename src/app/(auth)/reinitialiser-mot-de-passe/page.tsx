"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Check, KeyRound, LinkIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Champ } from "@/components/formulaire/champ";
import { ForceMotDePasse } from "@/components/formulaire/force-mot-de-passe";
import { EcranPaiementEchoue } from "@/components/formulaire/ecrans-paiement";
import { authClient } from "@/lib/auth-client";
import { useT } from "@/lib/i18n/contexte";

/** Pause pendant laquelle la coche de succès s'affiche avant de retourner à la connexion. */
const DELAI_SUCCES_MS = 1400;

function FormulaireReinitialisation() {
  const t = useT();
  const router = useRouter();
  const token = useSearchParams().get("token");
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [motDePasse, setMotDePasse] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [reussi, setReussi] = useState(false);

  if (!token) {
    return (
      <EcranPaiementEchoue titre={t("Lien invalide")} texte={t("Ce lien de réinitialisation est incomplet.")}>
        <Link href="/mot-de-passe-oublie" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline">
          <LinkIcon className="size-4" aria-hidden />
          {t("Demander un nouveau lien")}
        </Link>
      </EcranPaiementEchoue>
    );
  }

  async function choisirNouveauMotDePasse(formData: FormData) {
    setErreur(null);
    const nouveau = String(formData.get("motDePasse"));
    const confirmer = String(formData.get("confirmation"));
    if (nouveau !== confirmer) {
      setErreur(t("Les deux mots de passe ne correspondent pas."));
      return;
    }

    setEnCours(true);
    const { error } = await authClient.resetPassword({ newPassword: nouveau, token: token! });
    setEnCours(false);

    if (error) {
      setErreur(t("Ce lien n'est plus valide — il a peut-être déjà été utilisé ou a expiré."));
      return;
    }

    setReussi(true);
    setTimeout(() => router.push("/connexion"), DELAI_SUCCES_MS);
  }

  const concordent = confirmation.length >= 8 && confirmation === motDePasse;

  if (reussi) {
    return (
      <div role="status" className="flex animate-in flex-col items-center gap-4 py-16 text-center duration-500 fade-in zoom-in-95">
        <span className="animate-auth-pop flex size-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
          <Check className="size-8" aria-hidden strokeWidth={3} />
        </span>
        <h1 className="text-2xl font-semibold tracking-tight">{t("Mot de passe mis à jour")}</h1>
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner />
          {t("Retour à la connexion…")}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-7">
      <div className="flex animate-in flex-col gap-1.5 duration-500 fade-in slide-in-from-bottom-2">
        <p className="text-sm font-semibold tracking-wide text-marque-orange-600 uppercase">{t("Sécurité du compte")}</p>
        <h1 className="text-3xl font-semibold tracking-tight">{t("Choisir un nouveau mot de passe")}</h1>
      </div>
      <form action={choisirNouveauMotDePasse} className="flex flex-col gap-4">
        <div className="flex animate-in flex-col gap-2.5 duration-500 fade-in slide-in-from-bottom-2 delay-100 fill-mode-both">
          <Champ label={t("Nouveau mot de passe")} id="motDePasse" name="motDePasse" type="password" required minLength={8} autoFocus autoComplete="new-password" value={motDePasse} onChange={(e) => setMotDePasse(e.target.value)} />
          <ForceMotDePasse valeur={motDePasse} />
        </div>
        <div className="animate-in duration-500 fade-in slide-in-from-bottom-2 delay-200 fill-mode-both">
        <Champ
          label={t("Confirmer le mot de passe")}
          id="confirmation"
          name="confirmation"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
          valide={concordent}
          erreur={confirmation.length >= 8 && !concordent ? t("Les deux mots de passe ne correspondent pas.") : null}
        />
        </div>

        {erreur ? (
          <p role="alert" className="animate-in rounded-xl bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive fade-in slide-in-from-top-1">
            {erreur}
          </p>
        ) : null}

        <Button type="submit" size="lg" disabled={enCours} className="h-12 w-full text-base">
          {enCours ? <Spinner data-icon="inline-start" /> : <KeyRound data-icon="inline-start" aria-hidden />}
          {enCours ? t("Enregistrement…") : t("Enregistrer le nouveau mot de passe")}
        </Button>
      </form>
    </div>
  );
}

export default function PageReinitialiserMotDePasse() {
  return (
    <Suspense fallback={null}>
      <FormulaireReinitialisation />
    </Suspense>
  );
}
