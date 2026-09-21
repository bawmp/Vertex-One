import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, Rocket, Building2, Wrench, Briefcase, LayoutGrid, Users2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Reveal } from "../reveal";
import { getT } from "@/lib/i18n/langue";
import { m } from "@/lib/i18n/catalogue";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return {
    title: `${t("À propos")} — Vertex One`,
    description: t("Pourquoi Vertex One existe, et pour qui — une suite de gestion pensée pour les entreprises de services au Cameroun."),
  };
}

const SECTEURS = [
  { icone: Building2, nom: m("Agences"), classeFond: "bg-blue-500", description: m("Communication, conseil, événementiel — pipeline commercial et facturation au même endroit.") },
  { icone: Wrench, nom: m("Artisans"), classeFond: "bg-orange-500", description: m("Vocabulaire adapté (Chantier plutôt que Projet), du devis jusqu'au paiement Mobile Money.") },
  { icone: Briefcase, nom: m("Cabinets"), classeFond: "bg-purple-500", description: m("Dossiers clients permanents, missions bornées, documents sensibles protégés.") },
  { icone: LayoutGrid, nom: m("Toute autre entreprise de services"), classeFond: "bg-teal-500", description: m("Le tronc commun (One CRM, One Books, One People, One Docs) s'adapte à votre activité.") },
];

export default async function PageAPropos() {
  const t = await getT();
  return (
    <div className="mx-auto max-w-3xl px-6 py-20">
      <Reveal>
        <h1 className="text-4xl font-semibold tracking-tight">{t("Pourquoi Vertex One")}</h1>
        <p className="mt-6 text-lg text-muted-foreground">
          {t("Les entreprises de services camerounaises font aujourd'hui un choix difficile : des logiciels internationaux puissants mais pensés pour d'autres réalités — facturés en devise étrangère, sans Mobile Money, sans conformité SYSCOHADA — ou des solutions locales plus simples mais qui n'offrent pas la même largeur fonctionnelle. Vertex One est construit pour ne plus avoir à choisir : la même couverture qu'une grande suite internationale, mais pensée Mobile Money-first, en français, conforme à la réglementation locale.")}
        </p>
      </Reveal>

      <Reveal delai={100} className="mt-16 rounded-lg border border-border bg-muted/30 p-6">
        <div className="flex items-start gap-3">
          <Rocket className="mt-0.5 size-6 shrink-0 text-primary" aria-hidden />
          <div>
            <h2 className="font-semibold">{t("En cours de lancement")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("Vertex One est un produit jeune. Nous préférons vous le dire clairement plutôt que d'afficher de faux témoignages : le produit est réel, testé, et prêt à gérer votre activité dès aujourd'hui — essayez-le gratuitement et faites-vous votre propre avis.")}
            </p>
          </div>
        </div>
      </Reveal>

      <Reveal>
        <h2 className="mt-16 text-2xl font-semibold tracking-tight">{t("Pour qui")}</h2>
        <p className="mt-3 text-muted-foreground">
          {t("Toute entreprise de services de moins d'une quinzaine de personnes, quel que soit son secteur — le vocabulaire de l'application s'adapte au vôtre.")}
        </p>
      </Reveal>
      <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2">
        {SECTEURS.map((secteur, index) => (
          <Reveal key={secteur.nom} delai={index * 70} className="flex flex-col gap-2">
            <span className={`flex size-11 items-center justify-center rounded-xl ${secteur.classeFond} text-white`}>
              <secteur.icone className="size-5.5" aria-hidden />
            </span>
            <h3 className="font-semibold">{t(secteur.nom)}</h3>
            <p className="text-sm text-muted-foreground">{t(secteur.description)}</p>
          </Reveal>
        ))}
      </div>

      <Reveal delai={80} className="mt-10 flex items-start gap-3 rounded-lg border border-border bg-muted/30 p-6">
        <Users2 className="mt-0.5 size-6 shrink-0 text-primary" aria-hidden />
        <div>
          <h3 className="font-semibold">{t("Vous possédez plusieurs entreprises ?")}</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("Reliez-les en groupe pour voir toutes vos filiales d'un coup d'œil — chacune garde sa propre connexion, ses propres données et son propre abonnement.")}
          </p>
        </div>
      </Reveal>

      <div className="mt-16 text-center">
        <Button size="lg" className="transition-transform hover:-translate-y-0.5" render={<Link href="/inscription" />} nativeButton={false}>
          {t("Essayer gratuitement")}
          <ArrowRight data-icon="inline-end" aria-hidden />
        </Button>
      </div>
    </div>
  );
}
