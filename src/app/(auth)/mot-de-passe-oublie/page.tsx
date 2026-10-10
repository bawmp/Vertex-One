"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Mail, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Champ } from "@/components/formulaire/champ";
import { EcranPaiementReussi } from "@/components/formulaire/ecrans-paiement";
import { authClient } from "@/lib/auth-client";
import { useT } from "@/lib/i18n/contexte";

export default function PageMotDePasseOublie() {
  const t = useT();
  const [envoye, setEnvoye] = useState(false);
  const [enCours, setEnCours] = useState(false);

  async function demanderReinitialisation(formData: FormData) {
    setEnCours(true);
    // Toujours le même message de confirmation, que l'adresse existe ou non — jamais révéler l'existence d'un
    // compte (même garde-fou que Better-Auth côté serveur, voir src/lib/auth.ts).
    await authClient.requestPasswordReset({ email: String(formData.get("email")) });
    setEnCours(false);
    setEnvoye(true);
  }

  if (envoye) {
    return (
      <div className="flex flex-col gap-6">
        <EcranPaiementReussi titre={t("Vérifiez vos emails")} texte={t("Si cette adresse correspond à un compte, un lien de réinitialisation vient de lui être envoyé.")} />
        <Link href="/connexion" className="inline-flex items-center justify-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-primary">
          <ArrowLeft className="size-4" aria-hidden />
          {t("Retour à la connexion")}
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-3xl font-semibold tracking-tight">{t("Mot de passe oublié")}</h1>
        <p className="text-muted-foreground">{t("Indiquez votre email, nous vous enverrons un lien pour choisir un nouveau mot de passe.")}</p>
      </div>

      <form action={demanderReinitialisation} className="flex flex-col gap-4">
        <Champ label={t("Email")} id="email" name="email" type="email" icone={Mail} autoComplete="email" inputMode="email" required autoFocus />
        <Button type="submit" size="lg" disabled={enCours} className="h-12 w-full text-base">
          {enCours ? <Spinner data-icon="inline-start" /> : <Send data-icon="inline-start" aria-hidden />}
          {enCours ? t("Envoi…") : t("Envoyer le lien")}
        </Button>
      </form>

      <Link href="/connexion" className="inline-flex items-center justify-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-primary">
        <ArrowLeft className="size-4" aria-hidden />
        {t("Retour à la connexion")}
      </Link>
    </div>
  );
}
