import Link from "next/link";
import {
  ArrowRight,
  Check,
  Smartphone,
  MessageCircle,
  Landmark,
  HandCoins,
  Rocket,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { MODULES_MARKETING } from "@/lib/marketing/modules";
import { COMPARATIF, FAQ_ACCUEIL, PRIX_ABONNEMENT_MENSUEL_FCFA, DUREE_ESSAI_JOURS, valeursSite } from "@/lib/marketing/contenu";
import { Reveal } from "./reveal";
import { CompteurAnime } from "./compteur-anime";
import { getTVisiteur } from "@/lib/i18n/langue";
import { m } from "@/lib/i18n/catalogue";

const ATOUTS = [
  { icone: Smartphone, titre: m("Mobile Money natif"), classeFond: "bg-blue-500", description: m("Orange Money et MTN MoMo intégrés — pas une carte bancaire étrangère à faire accepter à vos clients.") },
  { icone: MessageCircle, titre: m("WhatsApp bientôt"), classeFond: "bg-emerald-500", description: m("Signatures, relances et notifications partent par email dès maintenant ; l'envoi par WhatsApp, le canal que vos clients utilisent tous les jours, arrive dans une prochaine mise à jour.") },
  { icone: Landmark, titre: m("Conforme au Cameroun"), classeFond: "bg-amber-500", description: m("SYSCOHADA, prêt pour la facturation électronique 2026 — pensé pour la réglementation locale, pas adapté après coup.") },
  { icone: HandCoins, titre: m("Sans coût d'implémentation"), classeFond: "bg-rose-500", description: m("Aucun intégrateur à payer pour démarrer, contrairement à l'implémentation d'un grand progiciel international classique.") },
];

/**
 * Le site vitrine reste accessible en permanence, connecté ou non (comme
 * zoho.com — le site marketing ne redirige jamais un client existant vers
 * l'application, qui a son propre point d'entrée) : pas de redirection vers
 * /app ici, décision explicite de l'utilisateur le 2026-09-14.
 */
export default async function PageAccueil() {
  const t = await getTVisiteur();
  return (
    <>
      {/* Héros */}
      <section className="relative overflow-hidden bg-gradient-to-br from-marque-bleu-800 via-marque-bleu to-marque-bleu-900 text-white">
        <div
          aria-hidden
          className="animate-flotter-lentement pointer-events-none absolute -top-24 -left-24 size-80 rounded-full bg-marque-orange/35 blur-3xl"
        />
        <div
          aria-hidden
          className="animate-flotter-lentement-inverse pointer-events-none absolute -right-24 top-1/3 size-96 rounded-full bg-marque-bleu-300/25 blur-3xl"
        />
        <div className="relative mx-auto flex max-w-6xl flex-col items-center gap-6 px-6 py-20 text-center sm:py-28">
          <Badge variant="brand" className="animate-pulse bg-white/10 text-white ring-white/20">
            {t("Essai gratuit {jours} jours — sans carte bancaire", { jours: DUREE_ESSAI_JOURS })}
          </Badge>
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">
            {t("La suite de gestion tout-en-un pour les entreprises de services au Cameroun")}
          </h1>
          <p className="max-w-2xl text-lg text-marque-bleu-50/90">
            {t("One CRM, One Books, One People, One Projects, One Bookings et plus — la même largeur fonctionnelle qu'un grand logiciel international, pensée Mobile Money-first, en français, sans les coûts d'implémentation.")}
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button
              size="lg"
              className="bg-marque-orange font-semibold text-marque-bleu-950 transition-transform hover:-translate-y-0.5 hover:bg-marque-orange-400"
              render={<Link href="/inscription" />}
              nativeButton={false}
            >
              {t("Essayer gratuitement")}
              <ArrowRight data-icon="inline-end" aria-hidden />
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="border-white/30 bg-transparent text-white transition-transform hover:-translate-y-0.5 hover:bg-white/10"
              render={<Link href="/tarifs" />}
              nativeButton={false}
            >
              {t("Voir les tarifs")}
            </Button>
          </div>
        </div>
      </section>

      {/* Bandeau "tout inclus" */}
      <section className="border-b border-border bg-muted/30">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-2 px-6 py-6 text-center sm:flex-row sm:justify-center sm:gap-3">
          <Check className="size-5 shrink-0 text-primary" aria-hidden />
          <p className="text-sm font-medium text-foreground sm:text-base">
            {t("Un seul prix,")} <CompteurAnime valeur={PRIX_ABONNEMENT_MENSUEL_FCFA} /> {t("FCFA/mois — tous les modules inclus, aucun mur de forfait, invitez toute votre équipe sans coût supplémentaire.")}
          </p>
        </div>
      </section>

      {/* Grille des modules */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <Reveal>
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-semibold tracking-tight">{t("Un module pour chaque partie de votre activité")}</h2>
            <p className="mt-3 text-muted-foreground">
              {t("Tous inclus dans le même abonnement, dès le premier jour — aucun n'est verrouillé derrière un forfait supérieur.")}
            </p>
          </div>
        </Reveal>
        <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {MODULES_MARKETING.map((module, index) => (
            <Reveal key={module.slug} delai={index * 60}>
              <Link href={`/modules/${module.slug}`}>
                <Card className="h-full transition-all hover:-translate-y-1 hover:shadow-lg">
                  <CardContent className="flex flex-col gap-3">
                    <span className={`flex size-11 items-center justify-center rounded-xl ${module.classeFond} text-white`}>
                      <module.icone className="size-5.5" aria-hidden />
                    </span>
                    <h3 className="font-semibold">{t(module.nom)}</h3>
                    <p className="text-sm text-muted-foreground">{t(module.resume)}</p>
                  </CardContent>
                </Card>
              </Link>
            </Reveal>
          ))}
        </div>
        <div className="mt-8 text-center">
          <Button variant="outline" render={<Link href="/modules" />} nativeButton={false}>
            {t("Voir tous les modules en détail")}
            <ArrowRight data-icon="inline-end" aria-hidden />
          </Button>
        </div>
      </section>

      {/* Kyria */}
      <section className="mx-auto max-w-6xl px-6 py-16">
        <Reveal className="flex flex-col items-center gap-4 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-500 px-6 py-12 text-center text-white sm:px-12">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-white/15">
            <Sparkles className="size-7" aria-hidden />
          </span>
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t("Une question ? Demandez à Kyria")}</h2>
          <p className="max-w-xl text-violet-50/90">
            {t("Notre assistante IA répond en direct à vos questions sur Vertex One — tarifs, modules, essai gratuit — directement depuis la bulle en bas à droite de votre écran, à tout moment.")}
          </p>
        </Reveal>
      </section>

      {/* Pourquoi Vertex One */}
      <section className="bg-muted/30 py-20">
        <div className="mx-auto max-w-6xl px-6">
          <Reveal>
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-3xl font-semibold tracking-tight">{t("Pensé pour le Cameroun, pas adapté après coup")}</h2>
            </div>
          </Reveal>
          <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {ATOUTS.map((atout, index) => (
              <Reveal key={atout.titre} delai={index * 80} className="flex flex-col gap-2">
                <span className={`flex size-11 items-center justify-center rounded-xl ${atout.classeFond} text-white`}>
                  <atout.icone className="size-5.5" aria-hidden />
                </span>
                <h3 className="font-semibold">{t(atout.titre)}</h3>
                <p className="text-sm text-muted-foreground">{t(atout.description)}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Comparatif */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <Reveal>
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-semibold tracking-tight">{t("Comment on se compare")}</h2>
            <p className="mt-3 text-muted-foreground">
              {t("Face aux solutions généralistes qui offrent le même type de service, sur des critères vérifiables.")}
            </p>
          </div>
        </Reveal>
        <Reveal delai={100} className="mt-10 overflow-x-auto">
          <table className="w-full min-w-[520px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="py-3 pr-4 font-medium text-muted-foreground">{t("Critère")}</th>
                <th className="py-3 px-4 font-semibold text-primary">Vertex One</th>
                <th className="py-3 px-4 font-medium text-muted-foreground">{t(COMPARATIF.libelleConcurrent)}</th>
              </tr>
            </thead>
            <tbody>
              {COMPARATIF.criteres.map((ligne) => (
                <tr key={ligne.critere} className="border-b border-border align-top">
                  <td className="py-3 pr-4 font-medium">{t(ligne.critere)}</td>
                  <td className="py-3 px-4 bg-primary/5">{t(ligne.vertexOne)}</td>
                  <td className="py-3 px-4 text-muted-foreground">{t(ligne.generaliste)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Reveal>
      </section>

      {/* Lancement honnête, pas de fausse preuve sociale */}
      <section className="bg-muted/30 py-20">
        <Reveal className="mx-auto flex max-w-3xl flex-col items-center gap-4 px-6 text-center">
          <Rocket className="size-8 text-primary" aria-hidden />
          <h2 className="text-2xl font-semibold tracking-tight">{t("En cours de lancement au Cameroun")}</h2>
          <p className="text-muted-foreground">
            {t("Vertex One est un produit jeune — nous préférons vous le dire plutôt que d'inventer des témoignages. Le code est réel, testé, et prêt à gérer votre activité dès aujourd'hui. Essayez-le gratuitement pendant {jours} jours et faites-vous votre propre avis.", { jours: DUREE_ESSAI_JOURS })}
          </p>
        </Reveal>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-3xl px-6 py-20">
        <Reveal>
          <h2 className="text-center text-3xl font-semibold tracking-tight">{t("Questions fréquentes")}</h2>
          <Accordion className="mt-10">
            {FAQ_ACCUEIL.map((item) => (
              <AccordionItem key={item.question} value={item.question}>
                <AccordionTrigger>{t(item.question)}</AccordionTrigger>
                <AccordionContent>{t(item.reponse, valeursSite(t.locale))}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </Reveal>
      </section>

      {/* CTA final */}
      <section className="relative overflow-hidden bg-gradient-to-br from-marque-bleu-800 via-marque-bleu to-marque-bleu-900 py-20 text-white">
        <div
          aria-hidden
          className="animate-flotter-lentement pointer-events-none absolute -bottom-20 left-1/4 size-72 rounded-full bg-marque-orange/30 blur-3xl"
        />
        <div className="relative mx-auto flex max-w-2xl flex-col items-center gap-6 px-6 text-center">
          <h2 className="text-3xl font-semibold tracking-tight">{t("Prêt à essayer Vertex One ?")}</h2>
          <p className="text-marque-bleu-50/90">
            {t("{jours} jours d'essai gratuit, tous les modules inclus. Aucune carte bancaire requise.", { jours: DUREE_ESSAI_JOURS })}
          </p>
          <Button
            size="lg"
            className="bg-marque-orange font-semibold text-marque-bleu-950 transition-transform hover:-translate-y-0.5 hover:bg-marque-orange-400"
            render={<Link href="/inscription" />}
            nativeButton={false}
          >
            {t("Créer mon entreprise")}
            <ArrowRight data-icon="inline-end" aria-hidden />
          </Button>
        </div>
      </section>
    </>
  );
}
