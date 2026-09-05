import { Wordmark } from "@/components/wordmark";

export default function LayoutAuth({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen grid md:grid-cols-2">
      <div className="relative hidden md:flex flex-col justify-between overflow-hidden bg-gradient-to-br from-emerald-800 via-emerald-700 to-emerald-900 p-10 text-white">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 size-96 rounded-full bg-emerald-500/20 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -left-16 bottom-0 size-72 rounded-full bg-amber-400/10 blur-3xl"
        />

        <Wordmark sombre className="text-lg" />

        <div className="relative flex flex-col gap-3">
          <p className="text-2xl font-medium leading-snug">
            La suite de gestion pensée pour les entreprises de services au Cameroun.
          </p>
          <p className="text-emerald-100/80">
            CRM, devis, facturation et paiement Mobile Money — sans les frais d&apos;implémentation d&apos;un
            grand logiciel international.
          </p>
        </div>

        <p className="relative text-xs text-emerald-100/60">Vertex Technology</p>
      </div>

      <div className="flex items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <div className="mb-6 flex justify-center md:hidden">
            <Wordmark />
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
