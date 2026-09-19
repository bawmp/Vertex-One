"use client";

import { useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Lien public de la page carrières : à copier et à partager (réseaux sociaux, WhatsApp, signature d'email...). */
export function LienPublicCarrieres({ url, publie }: { url: string; publie: boolean }) {
  const [copie, setCopie] = useState(false);

  async function copier() {
    try {
      await navigator.clipboard.writeText(url);
      setCopie(true);
      setTimeout(() => setCopie(false), 2000);
    } catch {
      // Presse-papiers indisponible (contexte non sécurisé, permission refusée) : le lien reste sélectionnable à la main.
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <code className="min-w-0 truncate rounded-md bg-muted px-2 py-1 text-sm">{url}</code>
        <Button type="button" variant="ghost" size="icon-sm" aria-label="Copier le lien" onClick={copier}>
          {copie ? <Check className="text-emerald-600" aria-hidden /> : <Copy aria-hidden />}
        </Button>
        <Button variant="outline" size="sm" render={<a href={url} target="_blank" rel="noopener noreferrer" />} nativeButton={false}>
          <ExternalLink data-icon="inline-start" aria-hidden />
          Voir la page
        </Button>
      </div>
      {!publie ? <p className="text-xs text-amber-700">La page n&apos;est pas encore publiée : ce lien affichera « page introuvable » tant que vous ne l&apos;avez pas publiée.</p> : null}
    </div>
  );
}
