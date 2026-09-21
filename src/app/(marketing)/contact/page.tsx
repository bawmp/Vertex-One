import type { Metadata } from "next";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { FormulaireContact } from "./formulaire-contact";
import { getT } from "@/lib/i18n/langue";
import { m } from "@/lib/i18n/catalogue";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return {
    title: `${t("Contact")} — Vertex One`,
    description: t("Une question sur Vertex One ? Écrivez-nous."),
  };
}

export default async function PageContact() {
  const t = await getT();
  return (
    <div className="mx-auto max-w-lg px-6 py-20">
      <div className="text-center">
        <h1 className="text-4xl font-semibold tracking-tight">{t("Parlons-en")}</h1>
        <p className="mt-4 text-muted-foreground">
          {t("Une question avant de vous lancer, ou besoin d'aide pour votre entreprise ? Écrivez-nous.")}
        </p>
      </div>

      <Card className="mt-12">
        <CardHeader>
          <CardTitle>{t("Envoyer un message")}</CardTitle>
          <CardDescription>{t("Nous répondons généralement sous 24 à 48 heures.")}</CardDescription>
        </CardHeader>
        <CardContent>
          <FormulaireContact />
        </CardContent>
      </Card>
    </div>
  );
}
