import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MODULES_MARKETING } from "@/lib/marketing/modules";
import { Reveal } from "../reveal";

export const metadata: Metadata = {
  title: "Modules — Vertex One",
  description: "Tous les modules de Vertex One, tous inclus dans le même abonnement : One CRM, One Books, One People, One Projects, One Bookings, One Recruit et plus.",
};

export default function PageModules() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-20">
      <Reveal>
        <div className="mx-auto max-w-2xl text-center">
          <h1 className="text-4xl font-semibold tracking-tight">Tous les modules, un seul abonnement</h1>
          <p className="mt-4 text-muted-foreground">
            Aucun module n&apos;est verrouillé derrière un forfait supérieur — contrairement à beaucoup de suites de
            gestion internationales, qui vendent chaque application séparément.
          </p>
        </div>
      </Reveal>
      <div className="mt-14 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {MODULES_MARKETING.map((module, index) => (
          <Reveal key={module.slug} delai={index * 60}>
            <Link href={`/modules/${module.slug}`}>
              <Card className="h-full transition-all hover:-translate-y-1 hover:shadow-lg">
                <CardContent className="flex flex-col gap-3">
                  <span className={`flex size-11 items-center justify-center rounded-xl ${module.classeFond} text-white`}>
                    <module.icone className="size-5.5" aria-hidden />
                  </span>
                  <h2 className="font-semibold">{module.nom}</h2>
                  <p className="text-sm text-muted-foreground">{module.resume}</p>
                  <span className="mt-1 inline-flex items-center gap-1 text-sm font-medium text-primary">
                    En savoir plus
                    <ArrowRight className="size-3.5" aria-hidden />
                  </span>
                </CardContent>
              </Card>
            </Link>
          </Reveal>
        ))}
      </div>
      <div className="mt-14 text-center">
        <Button size="lg" render={<Link href="/inscription" />} nativeButton={false}>
          Essayer gratuitement
        </Button>
      </div>
    </div>
  );
}
