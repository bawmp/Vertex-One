"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Champ } from "@/components/formulaire/champ";
import { authClient } from "@/lib/auth-client";
import { useT } from "@/lib/i18n/contexte";

export default function PageConnexion() {
  const t = useT();
  const router = useRouter();
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [secousse, setSecousse] = useState(0);

  async function seConnecter(formData: FormData) {
    setErreur(null);
    setEnCours(true);

    const { data, error } = await authClient.signIn.email({
      email: String(formData.get("email")),
      password: String(formData.get("motDePasse")),
    });

    setEnCours(false);

    if (error) {
      setErreur(t("Email ou mot de passe incorrect."));
      setSecousse((n) => n + 1); // relance l'animation de secousse du formulaire
      return;
    }

    // Portail client (échange du 2026-09-13) — role est un additionalField
    // Better-Auth déjà exposé sur l'utilisateur retourné (src/lib/auth.ts).
    const role = (data?.user as { role?: string } | undefined)?.role;
    router.push(role === "CLIENT" ? "/portail" : "/app");
  }

  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-3xl font-semibold tracking-tight">{t("Connexion à Vertex One")}</h1>
        <p className="text-muted-foreground">{t("Accédez à votre espace entreprise.")}</p>
      </div>

      <form key={secousse} action={seConnecter} className={erreur ? "animate-secousse flex flex-col gap-4" : "flex flex-col gap-4"}>
        <Champ label={t("Email")} id="email" name="email" type="email" icone={Mail} autoComplete="email" inputMode="email" required />
        <div className="flex flex-col gap-2">
          <Champ label={t("Mot de passe")} id="motDePasse" name="motDePasse" type="password" autoComplete="current-password" required />
          <Link href="/mot-de-passe-oublie" className="self-end text-xs text-muted-foreground underline-offset-4 transition-colors hover:text-primary hover:underline">
            {t("Mot de passe oublié ?")}
          </Link>
        </div>

        {erreur ? (
          <p role="alert" className="animate-in rounded-xl bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive fade-in slide-in-from-top-1">
            {erreur}
          </p>
        ) : null}

        <Button type="submit" size="lg" disabled={enCours} className="h-12 w-full text-base">
          {enCours ? <Spinner data-icon="inline-start" /> : null}
          {enCours ? t("Connexion…") : t("Se connecter")}
          {!enCours ? <ArrowRight data-icon="inline-end" aria-hidden /> : null}
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
