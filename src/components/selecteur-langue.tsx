"use client";

import { useRouter } from "next/navigation";
import { useLangue, useT } from "@/lib/i18n/contexte";
import { memoriserLangue } from "@/lib/i18n/cookie-langue";
import type { Langue } from "@/lib/session";

const LANGUES: { code: Langue; libelle: string }[] = [
  { code: "fr", libelle: "FR" },
  { code: "en", libelle: "EN" },
];

/** Choix de langue d'un visiteur sans compte : mémorisé dans un cookie, la page se recharge dans la langue choisie. */
export function SelecteurLangue({ className }: { className?: string }) {
  const t = useT();
  const langue = useLangue();
  const router = useRouter();

  function choisir(code: Langue) {
    if (code === langue) return;
    memoriserLangue(code);
    router.refresh();
  }

  return (
    <div role="group" aria-label={t("Langue")} className={`inline-flex overflow-hidden rounded-lg border border-border text-xs font-medium ${className ?? ""}`}>
      {LANGUES.map((l) => (
        <button
          key={l.code}
          type="button"
          onClick={() => choisir(l.code)}
          aria-pressed={langue === l.code}
          className={`px-2.5 py-1 transition-colors ${langue === l.code ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`}
        >
          {l.libelle}
        </button>
      ))}
    </div>
  );
}
