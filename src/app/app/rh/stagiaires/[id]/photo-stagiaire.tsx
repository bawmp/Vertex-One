"use client";

import { useActionState, useRef } from "react";
import { Camera } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { AvatarCollaborateur } from "@/components/avatar-collaborateur";
import { changerPhotoStagiaire, type EtatPhoto } from "@/lib/actions/photo-rh";

/** Photo d'un stagiaire académique (sans compte), dans l'en-tête de la fiche : posée par l'Administrateur ou son responsable. */
export function PhotoStagiaire({ stagiaireId, nom, adresse, version, modifiable }: { stagiaireId: string; nom: string; adresse: string | null; version: string; modifiable: boolean }) {
  const [etat, action, enCours] = useActionState(changerPhotoStagiaire.bind(null, stagiaireId), null as EtatPhoto);
  const formulaire = useRef<HTMLFormElement>(null);
  const libelle = adresse ? "Changer la photo" : "Ajouter une photo";
  return (
    <div className="flex flex-col items-start gap-1.5">
      <div className="relative">
        <AvatarCollaborateur nom={nom} adresse={adresse} taille="hero" version={version} />
        {modifiable ? (
          <form ref={formulaire} action={action}>
            <input id="photo-stagiaire" name="photo" type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="sr-only" onChange={(e) => { if (e.target.files && e.target.files.length > 0) formulaire.current?.requestSubmit(); }} />
            <button
              type="button"
              aria-label={libelle}
              title={libelle}
              disabled={enCours}
              onClick={() => document.getElementById("photo-stagiaire")?.click()}
              className="absolute right-0 bottom-0 flex size-9 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md ring-4 ring-card transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-60"
            >
              {enCours ? <Spinner /> : <Camera className="size-4" aria-hidden />}
            </button>
          </form>
        ) : null}
      </div>
      {modifiable ? (
        <div className="flex min-h-5 flex-wrap items-center gap-x-3 text-xs">
          <span className="text-muted-foreground">{libelle}</span>
          {etat?.erreur ? <span role="alert" className="text-destructive">{etat.erreur}</span> : null}
          {etat?.message ? <span role="status" className="text-emerald-700 dark:text-emerald-400">{etat.message}</span> : null}
        </div>
      ) : null}
    </div>
  );
}
