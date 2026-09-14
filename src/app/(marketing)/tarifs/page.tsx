import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { MODULES_MARKETING } from "@/lib/marketing/modules";
import { FAQ_TARIFS, PRIX_ABONNEMENT_MENSUEL_FCFA, DUREE_ESSAI_JOURS, DELAI_GRACE_HEURES } from "@/lib/marketing/contenu";

export const metadata: Metadata = {
  title: "Tarifs — Vertex One",
  description: `Un seul abonnement à ${PRIX_ABONNEMENT_MENSUEL_FCFA.toLocaleString("fr-FR")} FCFA/mois, tous les modules inclus. Essai gratuit ${DUREE_ESSAI_JOURS} jours.`,
};

export default function PageTarifs() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-20">
      <div className="mx-auto max-w-2xl text-center">
        <h1 className="text-4xl font-semibold tracking-tight">Un seul prix, tout inclus</h1>
        <p className="mt-4 text-muted-foreground">
          Pas de forfait Starter/Pro/Business, pas d&apos;add-on à débloquer — un abonnement, tous les modules, toute
          votre équipe.
        </p>
      </div>

      <Card className="mx-auto mt-14 max-w-md ring-2 ring-primary">
        <CardContent className="flex flex-col items-center gap-6 py-4 text-center">
          <div>
            <p className="text-sm font-medium text-muted-foreground">Abonnement Vertex One</p>
            <p className="mt-2 text-5xl font-semibold tracking-tight">
              {PRIX_ABONNEMENT_MENSUEL_FCFA.toLocaleString("fr-FR")}
              <span className="text-lg font-normal text-muted-foreground"> FCFA/mois</span>
            </p>
            <p className="mt-1 text-sm text-muted-foreground">Essai gratuit {DUREE_ESSAI_JOURS} jours, sans carte bancaire</p>
          </div>

          <ul className="flex w-full flex-col gap-2.5 text-left text-sm">
            {[
              "Tous les modules inclus, sans exception",
              "Employés et collaborateurs illimités",
              "Paiement Mobile Money (Orange Money, MTN MoMo)",
              `Délai de grâce de ${DELAI_GRACE_HEURES}h après échéance avant toute suspension`,
              "Support humain local",
            ].map((avantage) => (
              <li key={avantage} className="flex items-start gap-2.5">
                <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                {avantage}
              </li>
            ))}
          </ul>

          <Button size="lg" className="w-full" render={<Link href="/inscription" />} nativeButton={false}>
            Commencer mon essai gratuit
            <ArrowRight data-icon="inline-end" aria-hidden />
          </Button>
        </CardContent>
      </Card>

      <div className="mt-16">
        <h2 className="text-center text-xl font-semibold">Ce qui est inclus</h2>
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {MODULES_MARKETING.map((module) => (
            <div key={module.slug} className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
              <module.icone className="size-4 shrink-0 text-primary" aria-hidden />
              {module.nom}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-16">
        <h2 className="text-center text-xl font-semibold">Questions sur la facturation</h2>
        <Accordion className="mt-8">
          {FAQ_TARIFS.map((item) => (
            <AccordionItem key={item.question} value={item.question}>
              <AccordionTrigger>{item.question}</AccordionTrigger>
              <AccordionContent>{item.reponse}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </div>
  );
}
