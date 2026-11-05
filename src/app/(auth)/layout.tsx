import { LogoEntreprise } from "@/components/logo-entreprise";
import { getTVisiteur } from "@/lib/i18n/langue";
import { SelecteurLangue } from "@/components/selecteur-langue";
import { PanneauMarque } from "@/components/auth/panneau-marque";
import { FondMarque } from "@/components/auth/fond-marque";
import { CaptureOrigine } from "@/components/capture-origine";

export default async function LayoutAuth({ children }: { children: React.ReactNode }) {
  const t = await getTVisiteur();
  return (
    <div className="min-h-dvh grid md:grid-cols-2">
      <CaptureOrigine />
      <div className="relative hidden md:flex flex-col justify-between overflow-hidden bg-gradient-to-br from-marque-bleu-800 via-marque-bleu to-marque-bleu-900 p-10 text-white">
        <div aria-hidden className="auth-motif-points pointer-events-none absolute inset-0" />
        <FondMarque variante="panneau" className="pointer-events-none absolute inset-0 size-full" />
        <div
          aria-hidden
          className="animate-flotter-lentement pointer-events-none absolute -right-24 -top-24 size-96 rounded-full bg-marque-orange/25 blur-3xl"
        />
        <div
          aria-hidden
          className="animate-flotter-lentement-inverse pointer-events-none absolute -left-16 bottom-0 size-72 rounded-full bg-marque-bleu-300/25 blur-3xl"
        />

        {/* Le logo officiel sur son panneau blanc : son texte bleu marine n'est pas lisible directement sur ce fond. */}
        <LogoEntreprise taille="hero" className="relative self-center" />

        <PanneauMarque />

        <p className="relative text-xs text-marque-bleu-100/70">{t("Vertex Technology")}</p>
      </div>

      <div className="relative flex flex-col overflow-hidden bg-marque-bleu md:bg-background md:items-center md:justify-center md:bg-gradient-to-b md:from-background md:to-marque-bleu-50/40 md:p-4">
        <SelecteurLangue className="absolute right-4 top-4 z-10 bg-background shadow-sm" />

        {/* Bureau : deux halos de marque très doux derrière la carte du formulaire. */}
        <div aria-hidden className="pointer-events-none absolute -top-24 -right-24 hidden size-96 rounded-full bg-marque-bleu-200/40 blur-3xl md:block" />
        <div aria-hidden className="pointer-events-none absolute -bottom-28 -left-20 hidden size-80 rounded-full bg-marque-orange-100/60 blur-3xl md:block" />

        {/* Mobile : bandeau de marque en haut, la carte du formulaire vient le recouvrir par le bas. */}
        <div className="relative h-44 overflow-hidden bg-gradient-to-br from-marque-bleu-800 via-marque-bleu to-marque-bleu-900 md:hidden">
          <div aria-hidden className="auth-motif-points pointer-events-none absolute inset-0" />
          <FondMarque className="pointer-events-none absolute inset-0 size-full" />
          <div aria-hidden className="animate-flotter-lentement pointer-events-none absolute -right-20 -top-20 size-64 rounded-full bg-marque-bleu-400/35 blur-3xl" />
          <div aria-hidden className="animate-flotter-lentement-inverse pointer-events-none absolute -left-16 bottom-0 size-48 rounded-full bg-marque-bleu-300/20 blur-3xl" />
        </div>

        <div className="relative -mt-8 flex flex-1 flex-col rounded-t-[2rem] bg-background px-5 pb-6 shadow-[0_-10px_30px_-12px_rgb(0_0_0/0.25)] md:mt-0 md:w-full md:max-w-md md:flex-none md:rounded-3xl md:border md:border-marque-bleu-100 md:bg-background/85 md:p-10 md:shadow-xl md:shadow-marque-bleu/10 md:backdrop-blur-sm">
          {/* Le logo chevauche le bord de la carte : bandeau, logo et titre partagent le même axe central. */}
          <div className="relative z-10 -mt-14 mb-7 flex justify-center md:hidden">
            <LogoEntreprise taille="hero" className="h-28 shadow-lg shadow-marque-bleu-900/25 ring-4 ring-background" />
          </div>
          <div className="mx-auto w-full max-w-sm animate-in fade-in slide-in-from-bottom-2 duration-500">{children}</div>
          <p className="mt-auto pt-10 text-center text-xs text-muted-foreground md:hidden">{t("Vertex Technology")}</p>
        </div>
      </div>
    </div>
  );
}
