"use client";

import { Paperclip, Pin, PinOff, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { epinglerAnnonce, supprimerAnnonce } from "@/lib/actions/annonce";
import { formaterTaille } from "@/lib/one-form/fichiers";
import { useT } from "@/lib/i18n/contexte";

export type PieceAnnonce = { id: string; nom: string; taille: number; image: boolean };

export function LigneAnnonce({
  id,
  contenu,
  auteurNom,
  creeLe,
  epinglee,
  pieces,
  peutGerer,
}: {
  id: string;
  contenu: string;
  auteurNom: string;
  creeLe: Date;
  epinglee: boolean;
  pieces: PieceAnnonce[];
  peutGerer: boolean;
}) {
  const t = useT();
  const images = pieces.filter((p) => p.image);
  const fichiers = pieces.filter((p) => !p.image);
  return (
    <Card className={epinglee ? "ring-primary/30" : undefined}>
      <CardContent className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium">{auteurNom}</p>
            <p className="text-xs text-muted-foreground">
              {new Intl.DateTimeFormat(t.locale, { dateStyle: "medium", timeStyle: "short" }).format(creeLe)}
            </p>
          </div>
          {peutGerer ? (
            <div className="flex shrink-0 gap-1">
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => epinglerAnnonce(id, !epinglee)}
                aria-label={epinglee ? t("Désépingler") : t("Épingler")}
                title={epinglee ? t("Désépingler") : t("Épingler")}
              >
                {epinglee ? <PinOff className="size-4" aria-hidden /> : <Pin className="size-4" aria-hidden />}
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => supprimerAnnonce(id)}
                aria-label={t("Supprimer")}
                title={t("Supprimer")}
                className="hover:text-destructive"
              >
                <Trash2 className="size-4" aria-hidden />
              </Button>
            </div>
          ) : null}
        </div>
        {contenu ? <p className="whitespace-pre-wrap text-sm">{contenu}</p> : null}
        {images.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {images.map((p) => (
              <a key={p.id} href={`/app/annonces/fichier/${p.id}?apercu=1`} target="_blank" rel="noopener noreferrer" aria-label={`Ouvrir l'image ${p.nom}`}>
                {/* Image protégée : servie par une route qui revérifie l'accès, donc pas de <Image> optimisé. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/app/annonces/fichier/${p.id}?apercu=1`} alt={p.nom} className="max-h-64 max-w-full rounded-lg border border-border object-cover" />
              </a>
            ))}
          </div>
        ) : null}
        {fichiers.length > 0 ? (
          <ul className="flex flex-col gap-1.5" aria-label={t("Pièces jointes")}>
            {fichiers.map((p) => (
              <li key={p.id}>
                <a href={`/app/annonces/fichier/${p.id}`} className="flex w-fit max-w-full items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm transition-colors hover:bg-muted">
                  <Paperclip className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="min-w-0 truncate font-medium">{p.nom}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{formaterTaille(p.taille)}</span>
                </a>
              </li>
            ))}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  );
}
