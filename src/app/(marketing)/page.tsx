import Link from "next/link";
import {
  ArrowRight,
  Check,
  Smartphone,
  MessageCircle,
  Landmark,
  HandCoins,
  Rocket,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { MODULES_MARKETING } from "@/lib/marketing/modules";
import { COMPARATIF, FAQ_ACCUEIL, PRIX_ABONNEMENT_MENSUEL_FCFA, DUREE_ESSAI_JOURS } from "@/lib/marketing/contenu";

const ATOUTS = [
  { icone: Smartphone, titre: "Mobile Money natif", description: "Orange Money et MTN MoMo intégrés — pas une carte bancaire étrangère à faire accepter à vos clients." },
  { icone: MessageCircle, titre: "WhatsApp-first", description: "Signatures, relances et notifications par le canal que vos clients utilisent déjà tous les jours." },
  { icone: Landmark, titre: "Conforme au Cameroun", description: "SYSCOHADA, prêt pour la facturation électronique 2026 — pensé pour la réglementation locale, pas adapté après coup." },
  { icone: HandCoins, titre: "Sans coût d'implémentation", description: "Aucun intégrateur à payer pour démarrer, contrairement à l'implémentation d'un grand progiciel international classique." },
];

/**
 * Le site vitrine reste accessible en permanence, connecté ou non (comme
 * zoho.com — le site marketing ne redirige jamais un client existant vers
 * l'application, qui a son propre point d'entrée) : pas de redirection vers
 * /app ici, décision explicite de l'utilisateur le 2026-09-14.
 */
export default function PageAccueil() {

  return (
    <>
      {/* Héros */}
      <section className="bg-gradient-to-br from-emerald-800 via-emerald-700 to-emerald-900 text-white">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-6 px-6 py-20 text-center sm:py-28">
          <Badge variant="brand" className="bg-white/10 text-white ring-white/20">
            Essai gratuit {DUREE_ESSAI_JOURS} jours — sans carte bancaire
          </Badge>
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">
            La suite de gestion tout-en-un pour les entreprises de services au Cameroun
          </h1>
          <p className="max-w-2xl text-lg text-emerald-50/90">
            CRM, facturation, RH, projets, réservations et plus — la même largeur fonctionnelle qu&apos;un grand logiciel
            international, pensée Mobile Money-first et WhatsApp-first, en français, sans les coûts d&apos;implémentation.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button size="lg" className="bg-white text-emerald-800 hover:bg-emerald-50" render={<Link href="/inscription" />} nativeButton={false}>
              Essayer gratuitement
              <ArrowRight data-icon="inline-end" aria-hidden />
            </Button>
            <Button size="lg" variant="outline" className="border-white/30 bg-transparent text-white hover:bg-white/10" render={<Link href="/tarifs" />} nativeButton={false}>
              Voir les tarifs
            </Button>
          </div>
        </div>
      </section>

      {/* Bandeau "tout inclus" */}
      <section className="border-b border-border bg-muted/30">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-2 px-6 py-6 text-center sm:flex-row sm:justify-center sm:gap-3">
          <Check className="size-5 shrink-0 text-primary" aria-hidden />
          <p className="text-sm font-medium text-foreground sm:text-base">
            Un seul prix, {PRIX_ABONNEMENT_MENSUEL_FCFA.toLocaleString("fr-FR")} FCFA/mois — tous les modules inclus, aucun
            mur de forfait, invitez toute votre équipe sans coût supplémentaire.
          </p>
        </div>
      </section>

      {/* Grille des modules */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight">Un module pour chaque partie de votre activité</h2>
          <p className="mt-3 text-muted-foreground">
            Tous inclus dans le même abonnement, dès le premier jour — aucun n&apos;est verrouillé derrière un forfait
            supérieur.
          </p>
        </div>
        <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {MODULES_MARKETING.map((module) => (
            <Link key={module.slug} href={`/modules/${module.slug}`}>
              <Card className="h-full transition-colors hover:bg-muted/40">
                <CardContent className="flex flex-col gap-3">
                  <module.icone className="size-6 text-primary" aria-hidden />
                  <h3 className="font-semibold">{module.nom}</h3>
                  <p className="text-sm text-muted-foreground">{module.resume}</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
        <div className="mt-8 text-center">
          <Button variant="outline" render={<Link href="/modules" />} nativeButton={false}>
            Voir tous les modules en détail
            <ArrowRight data-icon="inline-end" aria-hidden />
          </Button>
        </div>
      </section>

      {/* Pourquoi Vertex One */}
      <section className="bg-muted/30 py-20">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-semibold tracking-tight">Pensé pour le Cameroun, pas adapté après coup</h2>
          </div>
          <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {ATOUTS.map((atout) => (
              <div key={atout.titre} className="flex flex-col gap-2">
                <atout.icone className="size-6 text-primary" aria-hidden />
                <h3 className="font-semibold">{atout.titre}</h3>
                <p className="text-sm text-muted-foreground">{atout.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Comparatif */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight">Comment on se compare</h2>
          <p className="mt-3 text-muted-foreground">
            Face aux solutions généralistes qui offrent le même type de service, sur des critères vérifiables.
          </p>
        </div>
        <div className="mt-10 overflow-x-auto">
          <table className="w-full min-w-[520px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="py-3 pr-4 font-medium text-muted-foreground">Critère</th>
                <th className="py-3 px-4 font-semibold text-primary">Vertex One</th>
                <th className="py-3 px-4 font-medium text-muted-foreground">{COMPARATIF.libelleConcurrent}</th>
              </tr>
            </thead>
            <tbody>
              {COMPARATIF.criteres.map((ligne) => (
                <tr key={ligne.critere} className="border-b border-border align-top">
                  <td className="py-3 pr-4 font-medium">{ligne.critere}</td>
                  <td className="py-3 px-4 bg-primary/5">{ligne.vertexOne}</td>
                  <td className="py-3 px-4 text-muted-foreground">{ligne.generaliste}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Lancement honnête, pas de fausse preuve sociale */}
      <section className="bg-muted/30 py-20">
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-4 px-6 text-center">
          <Rocket className="size-8 text-primary" aria-hidden />
          <h2 className="text-2xl font-semibold tracking-tight">En cours de lancement au Cameroun</h2>
          <p className="text-muted-foreground">
            Vertex One est un produit jeune — nous préférons vous le dire plutôt que d&apos;inventer des témoignages. Le
            code est réel, testé, et prêt à gérer votre activité dès aujourd&apos;hui. Essayez-le gratuitement pendant{" "}
            {DUREE_ESSAI_JOURS} jours et faites-vous votre propre avis.
          </p>
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-3xl px-6 py-20">
        <h2 className="text-center text-3xl font-semibold tracking-tight">Questions fréquentes</h2>
        <Accordion className="mt-10">
          {FAQ_ACCUEIL.map((item) => (
            <AccordionItem key={item.question} value={item.question}>
              <AccordionTrigger>{item.question}</AccordionTrigger>
              <AccordionContent>{item.reponse}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>

      {/* CTA final */}
      <section className="bg-gradient-to-br from-emerald-800 via-emerald-700 to-emerald-900 py-20 text-white">
        <div className="mx-auto flex max-w-2xl flex-col items-center gap-6 px-6 text-center">
          <h2 className="text-3xl font-semibold tracking-tight">Prêt à essayer Vertex One ?</h2>
          <p className="text-emerald-50/90">
            {DUREE_ESSAI_JOURS} jours d&apos;essai gratuit, tous les modules inclus. Aucune carte bancaire requise.
          </p>
          <Button size="lg" className="bg-white text-emerald-800 hover:bg-emerald-50" render={<Link href="/inscription" />} nativeButton={false}>
            Créer mon entreprise
            <ArrowRight data-icon="inline-end" aria-hidden />
          </Button>
        </div>
      </section>
    </>
  );
}
