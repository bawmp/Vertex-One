"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { creerEntreprise } from "@/lib/actions/entreprise";
import { useT } from "@/lib/i18n/contexte";

export default function PageInscription() {
  const t = useT();
  const [etat, action, enCours] = useActionState(creerEntreprise, null);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("Créer votre entreprise sur Vertex One")}</CardTitle>
        <CardDescription>{t("Le premier compte créé devient Administrateur.")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="nomEntreprise">{t("Nom de l'entreprise")}</Label>
            <Input id="nomEntreprise" name="nomEntreprise" required minLength={2} />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="secteurProfil">{t("Secteur")}</Label>
            <Select id="secteurProfil" name="secteurProfil" required defaultValue="generique">
              <option value="agence">{t("Agence")}</option>
              <option value="artisan">{t("Artisan")}</option>
              <option value="cabinet">{t("Cabinet")}</option>
              <option value="generique">{t("Autre")}</option>
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="nomComplet">{t("Votre nom complet")}</Label>
            <Input id="nomComplet" name="nomComplet" required minLength={2} />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="email">{t("Email")}</Label>
            <Input id="email" name="email" type="email" required />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="motDePasse">{t("Mot de passe")}</Label>
            <Input id="motDePasse" name="motDePasse" type="password" required minLength={8} />
          </div>

          {etat?.erreur ? <p className="text-sm text-destructive">{etat.erreur}</p> : null}

          <Button type="submit" disabled={enCours} className="w-full">
            {enCours ? <Spinner /> : null}
            {enCours ? t("Création en cours…") : t("Créer mon entreprise")}
          </Button>
        </form>

        <p className="mt-4 text-center text-sm text-muted-foreground">
          {t("Déjà inscrit ?")}{" "}
          <Link href="/connexion" className="underline underline-offset-4">
            {t("Se connecter")}
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
