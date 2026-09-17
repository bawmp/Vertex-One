"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Eye, EyeOff, Copy, Check, ExternalLink, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { revelerSecret } from "@/lib/actions/one-vault";

type Secret = { id: string; titre: string; identifiant: string | null; url: string | null; partage: boolean };

export function LigneSecret({ secret, peutModifier }: { secret: Secret; peutModifier: boolean }) {
  const [motDePasse, setMotDePasse] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [copie, setCopie] = useState(false);
  const [enCours, startTransition] = useTransition();

  function basculerRevelation() {
    if (motDePasse !== null) {
      setMotDePasse(null);
      return;
    }
    setErreur(null);
    startTransition(async () => {
      const resultat = await revelerSecret(secret.id);
      if (!resultat.ok) setErreur(resultat.erreur);
      else setMotDePasse(resultat.motDePasse);
      setCopie(false);
    });
  }

  function copier() {
    if (!motDePasse) return;
    navigator.clipboard.writeText(motDePasse).then(() => setCopie(true));
  }

  return (
    <div className="flex flex-col gap-2 px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="truncate font-medium">{secret.titre}</p>
            <Badge variant={secret.partage ? "info" : "neutral"}>{secret.partage ? "Partagé" : "Privé"}</Badge>
          </div>
          {secret.identifiant ? <p className="truncate text-xs text-muted-foreground">{secret.identifiant}</p> : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {secret.url ? (
            <Button variant="ghost" size="icon-sm" aria-label="Ouvrir le lien" render={<a href={secret.url} target="_blank" rel="noreferrer" />} nativeButton={false}>
              <ExternalLink className="size-3.5" aria-hidden />
            </Button>
          ) : null}
          <Button variant="ghost" size="icon-sm" aria-label={motDePasse !== null ? "Masquer" : "Révéler le mot de passe"} onClick={basculerRevelation} disabled={enCours}>
            {enCours ? <Spinner className="size-3.5" /> : motDePasse !== null ? <EyeOff className="size-3.5" aria-hidden /> : <Eye className="size-3.5" aria-hidden />}
          </Button>
          {peutModifier ? (
            <Button variant="ghost" size="icon-sm" aria-label="Modifier" render={<Link href={`/app/one-vault/${secret.id}`} />} nativeButton={false}>
              <Pencil className="size-3.5" aria-hidden />
            </Button>
          ) : null}
        </div>
      </div>

      {motDePasse !== null ? (
        <div className="flex items-center gap-2 rounded-md bg-muted px-2.5 py-1.5">
          <code className="flex-1 truncate text-sm">{motDePasse || "(aucun mot de passe enregistré)"}</code>
          {motDePasse ? (
            <Button type="button" variant="ghost" size="icon-sm" aria-label="Copier" onClick={copier}>
              {copie ? <Check className="size-3.5 text-emerald-600" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
            </Button>
          ) : null}
        </div>
      ) : null}

      {erreur ? <p className="text-sm text-destructive">{erreur}</p> : null}
    </div>
  );
}
