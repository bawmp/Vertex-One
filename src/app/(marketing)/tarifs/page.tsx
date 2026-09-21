import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { MODULES_MARKETING } from "@/lib/marketing/modules";
import { FAQ_TARIFS, PRIX_ABONNEMENT_MENSUEL_FCFA, DUREE_ESSAI_JOURS, DELAI_GRACE_HEURES, valeursSite } from "@/lib/marketing/contenu";
import { Reveal } from "../reveal";
import { CompteurAnime } from "../compteur-anime";
import { getT } from "@/lib/i18n/langue";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return {
    title: `${t("Tarifs")} — Vertex One`,
    description: t("Un seul abonnement à {prix} FCFA/mois, tous les modules inclus. Essai gratuit {jours} jours.", { prix: PRIX_ABONNEMENT_MENSUEL_FCFA.toLocaleString(t.locale), jours: DUREE_ESSAI_JOURS }),
  };
}

export default async function PageTarifs() {
  const t = await getT();
  return (
    <div className="mx-auto max-w-4xl px-6 py-20">
      <Reveal>
        <div className="mx-auto max-w-2xl text-center">
          <h1 className="text-4xl font-semibold tracking-tight">{t("Un seul prix, tout inclus")}</h1>
          <p className="mt-4 text-muted-foreground">
            {t("Pas de forfait Starter/Pro/Business, pas d'add-on à débloquer — un abonnement, tous les modules, toute votre équipe.")}
          </p>
        </div>
      </Reveal>

      <Reveal delai={100}>
        <Card className="mx-auto mt-14 max-w-md ring-2 ring-primary transition-transform hover:-translate-y-1">
          <CardContent className="flex flex-col items-center gap-6 py-4 text-center">
            <div>
              <p className="text-sm font-medium text-muted-foreground">{t("Abonnement Vertex One")}</p>
              <p className="mt-2 text-5xl font-semibold tracking-tight">
                <CompteurAnime valeur={PRIX_ABONNEMENT_MENSUEL_FCFA} duree={1000} />
                <span className="text-lg font-normal text-muted-foreground"> {t("FCFA/mois")}</span>
              </p>
              <p className="mt-1 text-sm text-muted-foreground">{t("Essai gratuit {jours} jours, sans carte bancaire", { jours: DUREE_ESSAI_JOURS })}</p>
            </div>

            <ul className="flex w-full flex-col gap-2.5 text-left text-sm">
              {[
                t("Tous les modules inclus, sans exception"),
                t("Employés et collaborateurs illimités"),
                t("Paiement Mobile Money (Orange Money, MTN MoMo)"),
                t("Délai de grâce de {heures}h après échéance avant toute suspension", { heures: DELAI_GRACE_HEURES }),
                t("Support humain local"),
              ].map((avantage) => (
                <li key={avantage} className="flex items-start gap-2.5">
                  <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                  {avantage}
                </li>
              ))}
            </ul>

            <Button size="lg" className="w-full transition-transform hover:-translate-y-0.5" render={<Link href="/inscription" />} nativeButton={false}>
              {t("Commencer mon essai gratuit")}
              <ArrowRight data-icon="inline-end" aria-hidden />
            </Button>
          </CardContent>
        </Card>
      </Reveal>

      <div className="mt-16">
        <Reveal>
          <h2 className="text-center text-xl font-semibold">{t("Ce qui est inclus")}</h2>
        </Reveal>
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {MODULES_MARKETING.map((module, index) => (
            <Reveal key={module.slug} delai={index * 40} className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm transition-colors hover:bg-muted/40">
              <span className={`flex size-6 shrink-0 items-center justify-center rounded-md ${module.classeFond} text-white`}>
                <module.icone className="size-3.5" aria-hidden />
              </span>
              {t(module.nom)}
            </Reveal>
          ))}
        </div>
      </div>

      <Reveal className="mt-16">
        <h2 className="text-center text-xl font-semibold">{t("Questions sur la facturation")}</h2>
        <Accordion className="mt-8">
          {FAQ_TARIFS.map((item) => (
            <AccordionItem key={item.question} value={item.question}>
              <AccordionTrigger>{t(item.question)}</AccordionTrigger>
              <AccordionContent>{t(item.reponse, valeursSite(t.locale))}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </Reveal>
    </div>
  );
}
