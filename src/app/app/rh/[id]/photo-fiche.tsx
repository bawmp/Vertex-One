"use client";

import { useActionState, useRef, useTransition } from "react";
import { Camera, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { AvatarCollaborateur } from "@/components/avatar-collaborateur";
import { changerMaPhoto, changerPhotoCollaborateur, retirerMaPhoto, type EtatPhoto } from "@/lib/actions/photo-rh";

/**
 * Photo de la fiche. La personne concernée la choisit elle-même (« Changer ma photo ») ; l'Administrateur peut aussi la poser pour un
 * collaborateur. Le fichier part dès qu'il est choisi ; les contrôles (image réelle, 2 Mo) sont refaits côté serveur.
 */
export function PhotoFiche({ nom, adresse, version, utilisateurId, proprietaire, peutChangerPourAutre }: { nom: string; adresse: string | null; version: string; utilisateurId: string; proprietaire: boolean; peutChangerPourAutre: boolean }) {
  const [etat, action, enCours] = useActionState(proprietaire ? changerMaPhoto : changerPhotoCollaborateur.bind(null, utilisateurId), null as EtatPhoto);
  const [retrait, demarrerRetrait] = useTransition();
  const formulaire = useRef<HTMLFormElement>(null);
  const peutChanger = proprietaire || peutChangerPourAutre;

  return (
    <div className="flex items-center gap-4">
      <AvatarCollaborateur nom={nom} adresse={adresse} taille="grand" version={version} />
      {peutChanger ? (
        <form ref={formulaire} action={action} className="flex flex-col gap-1.5">
          <input
            id="photo-fiche"
            name="photo"
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="sr-only"
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) formulaire.current?.requestSubmit();
            }}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" variant="outline" disabled={enCours || retrait} onClick={() => document.getElementById("photo-fiche")?.click()}>
              {enCours ? <Spinner /> : <Camera data-icon="inline-start" aria-hidden />}
              {proprietaire ? (adresse ? "Changer ma photo" : "Ajouter ma photo") : adresse ? "Changer la photo" : "Ajouter une photo"}
            </Button>
            {proprietaire && adresse ? (
              <Button type="button" size="sm" variant="ghost" disabled={enCours || retrait} onClick={() => demarrerRetrait(async () => void (await retirerMaPhoto()))}>
                <Trash2 data-icon="inline-start" aria-hidden />
                Retirer
              </Button>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">Image PNG, JPEG ou WebP, 2 Mo au plus.</p>
          {etat?.erreur ? <p role="alert" className="text-xs text-destructive">{etat.erreur}</p> : null}
          {etat?.message ? <p role="status" className="text-xs text-emerald-700 dark:text-emerald-400">{etat.message}</p> : null}
        </form>
      ) : null}
    </div>
  );
}
