"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Check, CircleAlert, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Champ } from "@/components/formulaire/champ";
import { authClient } from "@/lib/auth-client";
import { useT } from "@/lib/i18n/contexte";

/** Pause pendant laquelle la coche de succès s'affiche avant d'ouvrir l'application. */
const DELAI_SUCCES_MS = 900;

export default function PageConnexion() {
  const t = useT();
  const router = useRouter();
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [reussi, setReussi] = useState(false);
  const [secousse, setSecousse] = useState(0);
  const [majusculesActives, setMajusculesActives] = useState(false);

  async function seConnecter(formData: FormData) {
    setErreur(null);
    setEnCours(true);

    const { data, error } = await authClient.signIn.email({
      email: String(formData.get("email")),
      password: String(formData.get("motDePasse")),
    });

    if (error) {
      setEnCours(false);
      setErreur(t("Email ou mot de passe incorrect."));
      setSecousse((n) => n + 1); // relance l'animation de secousse du formulaire
      return;
    }

    // Portail client (échange du 2026-09-13) — role est un additionalField
    // Better-Auth déjà exposé sur l'utilisateur retourné (src/lib/auth.ts).
    const role = (data?.user as { role?: string } | undefined)?.role;
    setReussi(true);
    setTimeout(() => router.push(role === "CLIENT" ? "/portail" : "/app"), DELAI_SUCCES_MS);
  }

  if (reussi) {
    return (
      <div role="status" className="flex animate-in flex-col items-center gap-4 py-16 text-center duration-500 fade-in zoom-in-95">
        <span className="animate-auth-pop flex size-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
          <Check className="size-8" aria-hidden strokeWidth={3} />
        </span>
        <h1 className="text-2xl font-semibold tracking-tight">{t("Connexion réussie")}</h1>
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner />
          {t("Ouverture de votre espace…")}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-7">
      <div className="flex animate-in flex-col gap-1.5 duration-500 fade-in slide-in-from-bottom-2">
        <p className="text-sm font-semibold tracking-wide text-marque-orange-600 uppercase">{t("Content de vous revoir")}</p>
        <h1 className="text-3xl font-semibold tracking-tight">{t("Connexion à Vertex One")}</h1>
        <p className="text-muted-foreground">{t("Accédez à votre espace entreprise.")}</p>
      </div>

      <form
        key={secousse}
        action={seConnecter}
        onKeyUp={(e) => setMajusculesActives(e.getModifierState("CapsLock"))}
        className={erreur ? "animate-secousse flex flex-col gap-4" : "flex flex-col gap-4"}
      >
        <div className="animate-in duration-500 fade-in slide-in-from-bottom-2 delay-100 fill-mode-both">
          <Champ label={t("Email")} id="email" name="email" type="email" icone={Mail} autoComplete="email" inputMode="email" required />
        </div>
        <div className="flex animate-in flex-col gap-2 duration-500 fade-in slide-in-from-bottom-2 delay-200 fill-mode-both">
          <Champ label={t("Mot de passe")} id="motDePasse" name="motDePasse" type="password" autoComplete="current-password" required />
          <div className="flex items-start justify-between gap-3">
            {majusculesActives ? (
              <p role="status" className="animate-in flex items-center gap-1.5 text-xs text-marque-orange-700 fade-in">
                <CircleAlert className="size-3.5" aria-hidden />
                {t("Verrouillage majuscules activé")}
              </p>
            ) : (
              <span />
            )}
            <Link href="/mot-de-passe-oublie" className="text-xs text-muted-foreground underline-offset-4 transition-colors hover:text-primary hover:underline">
              {t("Mot de passe oublié ?")}
            </Link>
          </div>
        </div>

        {erreur ? (
          <p role="alert" className="animate-in rounded-xl bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive fade-in slide-in-from-top-1">
            {erreur}
          </p>
        ) : null}

        <Button type="submit" size="lg" disabled={enCours} className="group h-12 w-full animate-in text-base duration-500 fade-in slide-in-from-bottom-2 delay-300 fill-mode-both">
          {enCours ? <Spinner data-icon="inline-start" /> : null}
          {enCours ? t("Connexion…") : t("Se connecter")}
          {!enCours ? <ArrowRight data-icon="inline-end" aria-hidden className="transition-transform duration-200 group-hover:translate-x-1" /> : null}
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        {t("Pas encore de compte ?")}{" "}
        <Link href="/inscription" className="font-medium text-primary underline-offset-4 hover:underline">
          {t("Créer votre entreprise")}
        </Link>
      </p>
    </div>
  );
}
