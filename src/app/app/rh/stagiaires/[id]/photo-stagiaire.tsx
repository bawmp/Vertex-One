"use client";

import { useActionState, useRef } from "react";
import { Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { AvatarCollaborateur } from "@/components/avatar-collaborateur";
import { changerPhotoStagiaire, type EtatPhoto } from "@/lib/actions/photo-rh";

/** Photo d'un stagiaire académique (sans compte) : posée par l'Administrateur ou son responsable. */
export function PhotoStagiaire({ stagiaireId, nom, adresse, version, modifiable }: { stagiaireId: string; nom: string; adresse: string | null; version: string; modifiable: boolean }) {
  const [etat, action, enCours] = useActionState(changerPhotoStagiaire.bind(null, stagiaireId), null as EtatPhoto);
  const formulaire = useRef<HTMLFormElement>(null);
  return (
    <div className="flex items-center gap-4">
      <AvatarCollaborateur nom={nom} adresse={adresse} taille="grand" version={version} />
      {modifiable ? (
        <form ref={formulaire} action={action} className="flex flex-col gap-1.5">
          <input id="photo-stagiaire" name="photo" type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="sr-only" onChange={(e) => { if (e.target.files && e.target.files.length > 0) formulaire.current?.requestSubmit(); }} />
          <Button type="button" size="sm" variant="outline" disabled={enCours} onClick={() => document.getElementById("photo-stagiaire")?.click()}>
            {enCours ? <Spinner /> : <Camera data-icon="inline-start" aria-hidden />}
            {adresse ? "Changer la photo" : "Ajouter une photo"}
          </Button>
          <p className="text-xs text-muted-foreground">Image PNG, JPEG ou WebP, 2 Mo au plus.</p>
          {etat?.erreur ? <p role="alert" className="text-xs text-destructive">{etat.erreur}</p> : null}
          {etat?.message ? <p role="status" className="text-xs text-emerald-700 dark:text-emerald-400">{etat.message}</p> : null}
        </form>
      ) : null}
    </div>
  );
}
