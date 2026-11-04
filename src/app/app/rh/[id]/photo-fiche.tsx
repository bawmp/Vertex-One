"use client";

import { useActionState, useRef, useTransition } from "react";
import { Camera, Trash2 } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { AvatarCollaborateur } from "@/components/avatar-collaborateur";
import { changerMaPhoto, changerPhotoCollaborateur, retirerMaPhoto, type EtatPhoto } from "@/lib/actions/photo-rh";
import { useT } from "@/lib/i18n/contexte";

/**
 * Photo de la fiche, dans l'en-tête. La personne concernée la choisit elle-même : un bouton appareil photo posé sur l'avatar (« Ajouter ma photo » /
 * « Changer ma photo »), et « Retirer » quand elle en a une. L'Administrateur peut aussi la poser pour un collaborateur. Le fichier part dès
 * qu'il est choisi ; les contrôles (image réelle, 2 Mo) sont refaits côté serveur.
 */
export function PhotoFiche({ nom, adresse, version, utilisateurId, proprietaire, peutChangerPourAutre }: { nom: string; adresse: string | null; version: string; utilisateurId: string; proprietaire: boolean; peutChangerPourAutre: boolean }) {
  const t = useT();
  const [etat, action, enCours] = useActionState(proprietaire ? changerMaPhoto : changerPhotoCollaborateur.bind(null, utilisateurId), null as EtatPhoto);
  const [retrait, demarrerRetrait] = useTransition();
  const formulaire = useRef<HTMLFormElement>(null);
  const peutChanger = proprietaire || peutChangerPourAutre;
  const libelle = proprietaire ? (adresse ? t("Changer ma photo") : t("Ajouter ma photo")) : adresse ? t("Changer la photo") : t("Ajouter une photo");

  return (
    <div className="flex flex-col items-start gap-1.5">
      <div className="relative">
        <AvatarCollaborateur nom={nom} adresse={adresse} taille="hero" version={version} />
        {peutChanger ? (
          <form ref={formulaire} action={action}>
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
            <button
              type="button"
              aria-label={libelle}
              title={libelle}
              disabled={enCours || retrait}
              onClick={() => document.getElementById("photo-fiche")?.click()}
              className="absolute right-0 bottom-0 flex size-9 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md ring-4 ring-card transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-60"
            >
              {enCours ? <Spinner /> : <Camera className="size-4" aria-hidden />}
            </button>
          </form>
        ) : null}
      </div>
      {peutChanger ? (
        <div className="flex min-h-5 flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
          <span className="text-muted-foreground">{libelle}</span>
          {proprietaire && adresse ? (
            <button type="button" disabled={enCours || retrait} onClick={() => demarrerRetrait(async () => void (await retirerMaPhoto()))} className="flex items-center gap-1 text-muted-foreground hover:text-destructive">
              <Trash2 className="size-3" aria-hidden />
              {t("Retirer")}
            </button>
          ) : null}
          {etat?.erreur ? <span role="alert" className="text-destructive">{etat.erreur}</span> : null}
          {etat?.message ? <span role="status" className="text-emerald-700 dark:text-emerald-400">{etat.message}</span> : null}
        </div>
      ) : null}
    </div>
  );
}
