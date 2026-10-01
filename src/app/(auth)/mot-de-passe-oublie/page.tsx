"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
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
      <Card>
        <CardHeader>
          <CardTitle>{t("Vérifiez vos emails")}</CardTitle>
          <CardDescription>{t("Si cette adresse correspond à un compte, un lien de réinitialisation vient de lui être envoyé.")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/connexion" className="text-sm underline underline-offset-4">
            {t("Retour à la connexion")}
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("Mot de passe oublié")}</CardTitle>
        <CardDescription>{t("Indiquez votre email, nous vous enverrons un lien pour choisir un nouveau mot de passe.")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={demanderReinitialisation} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">{t("Email")}</Label>
            <Input id="email" name="email" type="email" required autoFocus />
          </div>

          <Button type="submit" disabled={enCours} className="w-full">
            {enCours ? <Spinner /> : null}
            {enCours ? t("Envoi…") : t("Envoyer le lien")}
          </Button>
        </form>

        <p className="mt-4 text-center text-sm text-muted-foreground">
          <Link href="/connexion" className="underline underline-offset-4">
            {t("Retour à la connexion")}
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
