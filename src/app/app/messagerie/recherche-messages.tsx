"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import type { ResultatRecherche } from "@/lib/messagerie/acces";
import { useT } from "@/lib/i18n/contexte";

const DELAI_SAISIE_MS = 300;

const date = (iso: string, locale: string) => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "Africa/Douala" }).format(new Date(iso));

/**
 * Recherche dans les messages des canaux visibles. Un clic sur un résultat ouvre le canal centré sur le message,
 * mis en évidence. Le serveur ne cherche que dans ce que la personne a le droit de voir.
 */
export function RechercheMessages({ nomsCanaux }: { nomsCanaux: Record<string, string> }) {
  const t = useT();
  const [saisie, setSaisie] = useState("");
  const [resultats, setResultats] = useState<ResultatRecherche[] | null>(null);
  const [enCours, setEnCours] = useState(false);
  const derniere = useRef(0);

  useEffect(() => {
    const requete = saisie.trim();
    if (requete.length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- remise à zéro quand la saisie devient trop courte.
      setResultats(null);
      return;
    }
    const numero = ++derniere.current;
    const minuteur = setTimeout(async () => {
      setEnCours(true);
      try {
        const reponse = await fetch(`/app/messagerie/recherche?q=${encodeURIComponent(requete)}`, { cache: "no-store" });
        // On ignore une réponse arrivée après une recherche plus récente.
        if (reponse.ok && numero === derniere.current) setResultats(((await reponse.json()) as { resultats: ResultatRecherche[] }).resultats);
      } catch {
        // Réseau coupé : la prochaine saisie relancera la recherche.
      } finally {
        if (numero === derniere.current) setEnCours(false);
      }
    }, DELAI_SAISIE_MS);
    return () => clearTimeout(minuteur);
  }, [saisie]);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input value={saisie} onChange={(e) => setSaisie(e.target.value)} placeholder={t("Rechercher un message…")} maxLength={100} aria-label={t("Rechercher dans les messages")} className="pl-8 pr-8" />
        {saisie ? (
          <button type="button" onClick={() => setSaisie("")} aria-label={t("Effacer la recherche")} className="absolute right-2 top-1/2 -translate-y-1/2">
            {enCours ? <Spinner className="size-3.5" /> : <X className="size-4 text-muted-foreground hover:text-foreground" aria-hidden />}
          </button>
        ) : null}
      </div>

      {resultats ? (
        <div role="region" aria-label={t("Résultats de la recherche")} className="flex max-h-80 flex-col overflow-y-auto rounded-lg border border-border bg-card">
          {resultats.length === 0 ? (
            <p className="p-3 text-sm text-muted-foreground">{t("Aucun message ne correspond.")}</p>
          ) : (
            resultats.map((r) => (
              <Link
                key={r.messageId}
                href={`/app/messagerie?canal=${r.canalId}&message=${r.parentId ?? r.messageId}`}
                onClick={() => setSaisie("")} // referme les résultats : le message s'ouvre dans la conversation
                className="flex flex-col gap-0.5 border-b border-border px-3 py-2 text-sm last:border-0 hover:bg-muted"
              >
                <span className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span className="truncate font-medium text-foreground">{nomsCanaux[r.canalId] ?? t("Canal")}</span>
                  <span className="shrink-0">{date(r.creeLe, t.locale)}</span>
                </span>
                <span className="text-xs text-muted-foreground">{r.auteurNom}</span>
                <span className="break-words">{r.extrait}</span>
              </Link>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
