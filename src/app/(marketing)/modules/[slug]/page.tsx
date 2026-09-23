import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MODULES_MARKETING, trouverModuleMarketing } from "@/lib/marketing/modules";
import { Reveal } from "../../reveal";
import { getTVisiteur } from "@/lib/i18n/langue";

export function generateStaticParams() {
  return MODULES_MARKETING.map((module) => ({ slug: module.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const t = await getTVisiteur();
  const { slug } = await params;
  const moduleMarketing = trouverModuleMarketing(slug);
  if (!moduleMarketing) return {};
  return {
    title: `${t(moduleMarketing.nom)} — Vertex One`,
    description: t(moduleMarketing.resume),
  };
}

export default async function PageModule({ params }: { params: Promise<{ slug: string }> }) {
  const t = await getTVisiteur();
  const { slug } = await params;
  const moduleMarketing = trouverModuleMarketing(slug);
  if (!moduleMarketing) notFound();

  return (
    <>
      <section className="relative overflow-hidden bg-gradient-to-br from-marque-bleu-800 via-marque-bleu to-marque-bleu-900 text-white">
        <div
          aria-hidden
          className="animate-flotter-lentement pointer-events-none absolute -top-16 right-1/4 size-64 rounded-full bg-marque-orange/30 blur-3xl"
        />
        <div className="relative mx-auto flex max-w-3xl flex-col items-center gap-4 px-6 py-16 text-center">
          <span className={`flex size-16 items-center justify-center rounded-2xl ${moduleMarketing.classeFond} shadow-lg`}>
            <moduleMarketing.icone className="size-8" aria-hidden />
          </span>
          <h1 className="text-4xl font-semibold tracking-tight">{t(moduleMarketing.nom)}</h1>
          <p className="max-w-xl text-lg text-marque-bleu-50/90">{t(moduleMarketing.resume)}</p>
        </div>
      </section>

      <section className="mx-auto max-w-2xl px-6 py-16">
        <h2 className="text-xl font-semibold">{t("Ce que fait vraiment ce module")}</h2>
        <ul className="mt-6 flex flex-col gap-4">
          {moduleMarketing.capacites.map((capacite, index) => (
            <Reveal key={capacite} as="li" delai={index * 60} className="flex items-start gap-3">
              <Check className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
              <span className="text-muted-foreground">{t(capacite)}</span>
            </Reveal>
          ))}
        </ul>

        <div className="mt-10 rounded-lg border border-border bg-muted/30 p-6 text-center">
          <p className="text-sm text-muted-foreground">
            {t("{module} est inclus dans l'unique abonnement Vertex One — aucun coût supplémentaire, aucun palier à débloquer.", { module: t(moduleMarketing.nom) })}
          </p>
          <div className="mt-4 flex flex-col justify-center gap-3 sm:flex-row">
            <Button render={<Link href="/inscription" />} nativeButton={false}>
              {t("Essayer gratuitement")}
              <ArrowRight data-icon="inline-end" aria-hidden />
            </Button>
            <Button variant="outline" render={<Link href="/modules" />} nativeButton={false}>
              {t("Voir les autres modules")}
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
