"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { authClient } from "@/lib/auth-client";
import { useT } from "@/lib/i18n/contexte";

function FormulaireReinitialisation() {
  const t = useT();
  const router = useRouter();
  const token = useSearchParams().get("token");
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  if (!token) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("Lien invalide")}</CardTitle>
          <CardDescription>{t("Ce lien de réinitialisation est incomplet.")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/mot-de-passe-oublie" className="text-sm underline underline-offset-4">
            {t("Demander un nouveau lien")}
          </Link>
        </CardContent>
      </Card>
    );
  }

  async function choisirNouveauMotDePasse(formData: FormData) {
    setErreur(null);
    const motDePasse = String(formData.get("motDePasse"));
    const confirmation = String(formData.get("confirmation"));
    if (motDePasse !== confirmation) {
      setErreur(t("Les deux mots de passe ne correspondent pas."));
      return;
    }

    setEnCours(true);
    const { error } = await authClient.resetPassword({ newPassword: motDePasse, token: token! });
    setEnCours(false);

    if (error) {
      setErreur(t("Ce lien n'est plus valide — il a peut-être déjà été utilisé ou a expiré."));
      return;
    }

    router.push("/connexion");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("Choisir un nouveau mot de passe")}</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={choisirNouveauMotDePasse} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="motDePasse">{t("Nouveau mot de passe")}</Label>
            <Input id="motDePasse" name="motDePasse" type="password" required minLength={8} autoFocus />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="confirmation">{t("Confirmer le mot de passe")}</Label>
            <Input id="confirmation" name="confirmation" type="password" required minLength={8} />
          </div>

          {erreur ? <p className="text-sm text-destructive">{erreur}</p> : null}

          <Button type="submit" disabled={enCours} className="w-full">
            {enCours ? <Spinner /> : null}
            {enCours ? t("Enregistrement…") : t("Enregistrer le nouveau mot de passe")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export default function PageReinitialiserMotDePasse() {
  return (
    <Suspense fallback={null}>
      <FormulaireReinitialisation />
    </Suspense>
  );
}
