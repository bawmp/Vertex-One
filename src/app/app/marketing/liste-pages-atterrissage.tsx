"use client";

import { useTransition } from "react";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { publierPageAtterrissage } from "@/lib/actions/page-atterrissage";

type Page = { id: string; slug: string; titre: string; publiee: boolean };

export function ListePagesAtterrissage({ pages, peutModifier }: { pages: Page[]; peutModifier: boolean }) {
  const [enCours, demarrer] = useTransition();

  if (pages.length === 0) {
    return <p className="text-sm text-muted-foreground">Aucune page d&apos;atterrissage pour le moment.</p>;
  }

  return (
    <Card className="p-0">
      <div className="flex flex-col divide-y divide-border">
        {pages.map((p) => (
          <div key={p.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
            <div className="flex min-w-0 flex-col">
              <span className="truncate font-medium">{p.titre}</span>
              {p.publiee ? (
                <Link href={`/p/${p.slug}`} target="_blank" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                  /p/{p.slug}
                  <ExternalLink className="size-3" aria-hidden />
                </Link>
              ) : (
                <span className="text-xs text-muted-foreground">/p/{p.slug}</span>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Badge variant={p.publiee ? "success" : "neutral"}>{p.publiee ? "Publiée" : "Brouillon"}</Badge>
              {peutModifier ? (
                <Button
                  size="xs"
                  variant="outline"
                  disabled={enCours}
                  onClick={() => demarrer(() => publierPageAtterrissage(p.id, !p.publiee))}
                >
                  {p.publiee ? "Dépublier" : "Publier"}
                </Button>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
