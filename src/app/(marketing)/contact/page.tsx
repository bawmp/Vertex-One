import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FormulaireContact } from "./formulaire-contact";
import { getTVisiteur } from "@/lib/i18n/langue";
import { metadonneesSite } from "@/lib/seo";
import { DUREE_ESSAI_JOURS } from "@/lib/marketing/contenu";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTVisiteur();
  return metadonneesSite({
    titre: `${t("Contact")} — Vertex One`,
    description: t("Une question sur Vertex One ? Écrivez-nous."),
    chemin: "/contact",
  });
}

export default async function PageContact() {
  const t = await getTVisiteur();
  return (
    <div className="mx-auto max-w-lg px-6 py-20">
      <div className="text-center">
        <h1 className="text-4xl font-semibold tracking-tight">{t("Vous souhaitez essayer Vertex One ?")}</h1>
        <p className="mt-4 text-muted-foreground">{t("Créez votre compte en quelques minutes — {jours} jours d'essai gratuit, sans carte bancaire.", { jours: DUREE_ESSAI_JOURS })}</p>
        <Button size="lg" className="mt-6 bg-marque-orange font-semibold text-marque-bleu-950 transition-transform hover:-translate-y-0.5 hover:bg-marque-orange-400" render={<Link href="/inscription" />} nativeButton={false}>
          {t("Créer mon compte")}
          <ArrowRight data-icon="inline-end" aria-hidden />
        </Button>
      </div>

      <div className="mt-16 text-center">
        <h2 className="text-xl font-semibold tracking-tight">{t("Besoin d'aide avant de commencer ?")}</h2>
      </div>

      <Card className="mt-6">
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
