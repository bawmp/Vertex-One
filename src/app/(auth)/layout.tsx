import { LogoEntreprise } from "@/components/logo-entreprise";
import { Wordmark } from "@/components/wordmark";

export default function LayoutAuth({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen grid md:grid-cols-2">
      <div className="relative hidden md:flex flex-col justify-between overflow-hidden bg-gradient-to-br from-marque-bleu-800 via-marque-bleu to-marque-bleu-900 p-10 text-white">
        <div
          aria-hidden
          className="animate-flotter-lentement pointer-events-none absolute -right-24 -top-24 size-96 rounded-full bg-marque-orange/25 blur-3xl"
        />
        <div
          aria-hidden
          className="animate-flotter-lentement-inverse pointer-events-none absolute -left-16 bottom-0 size-72 rounded-full bg-marque-bleu-300/25 blur-3xl"
        />

        {/* Le logo officiel sur son panneau blanc : son texte bleu marine n'est pas lisible directement sur ce fond. */}
        <LogoEntreprise taille="hero" className="relative self-start" />

        <div className="relative flex flex-col gap-3">
          <p className="text-2xl font-medium leading-snug">
            La suite de gestion pensée pour les entreprises de services au Cameroun.
          </p>
          <p className="text-marque-bleu-100/90">
            CRM, devis, facturation et paiement Mobile Money — sans les frais d&apos;implémentation d&apos;un
            grand logiciel international.
          </p>
        </div>

        <p className="relative text-xs text-marque-bleu-100/70">Vertex Technology</p>
      </div>

      <div className="flex items-center justify-center p-4">
        <div className="w-full max-w-sm animate-in fade-in slide-in-from-bottom-2 duration-500">
          <div className="mb-6 flex justify-center md:hidden">
            <Wordmark slogan className="h-28" />
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
