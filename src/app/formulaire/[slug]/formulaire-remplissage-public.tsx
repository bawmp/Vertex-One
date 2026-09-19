"use client";

import { useState, useTransition } from "react";
import Script from "next/script";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { soumettreReponseFormulaire } from "@/lib/actions/one-form";
import { attributAccept, categoriesDuChamp, formaterTaille, libelleCategories, TAILLE_MAX_TOTAL_LIBELLE, TAILLE_MAX_TOTAL_OCTETS } from "@/lib/one-form/fichiers";

type Champ = { id: string; type: string; libelle: string; obligatoire: boolean; options: string[] | null };

export function FormulaireRemplissagePublic({ slug, champs, messageConfirmation }: { slug: string; champs: Champ[]; messageConfirmation: string }) {
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoye, setEnvoye] = useState(false);
  const [enCours, startTransition] = useTransition();

  if (envoye) {
    return <p className="text-sm text-emerald-700">{messageConfirmation}</p>;
  }

  function envoyer(formData: FormData) {
    setErreur(null);
    // Confort : évite un aller-retour vers le serveur (et l'erreur brute de la
    // plateforme au-delà de 4,5 Mo). Le serveur revérifie toujours.
    const tailleFichiers = [...formData.values()].reduce((total, v) => (v instanceof File ? total + v.size : total), 0);
    if (tailleFichiers > TAILLE_MAX_TOTAL_OCTETS) {
      setErreur(`Les fichiers dépassent ${TAILLE_MAX_TOTAL_LIBELLE} au total (${formaterTaille(tailleFichiers)}). Réduisez-les ou retirez-en un.`);
      return;
    }
    startTransition(async () => {
      const resultat = await soumettreReponseFormulaire(slug, formData);
      if (resultat.erreur) {
        setErreur(resultat.erreur);
        // Le jeton Turnstile n'est valable qu'une fois (déjà consommé par la
        // vérification serveur) : sans nouveau défi, tout renvoi échouerait.
        (window as unknown as { turnstile?: { reset: () => void } }).turnstile?.reset();
      } else setEnvoye(true);
    });
  }

  return (
    // onSubmit plutôt que action={...} : React 19 vide automatiquement les
    // champs d'un formulaire après une action, même quand elle renvoie une
    // erreur — le visiteur perdait alors tout ce qu'il avait saisi (et ses
    // fichiers) à la moindre erreur de validation.
    <form
      onSubmit={(e) => {
        e.preventDefault();
        envoyer(new FormData(e.currentTarget));
      }}
      className="flex flex-col gap-4"
    >
      {champs.map((champ) => (
        <div key={champ.id} className="flex flex-col gap-2">
          <Label htmlFor={champ.id}>
            {champ.libelle}
            {champ.obligatoire ? <span className="text-destructive"> *</span> : null}
          </Label>
          <ChampFormulaire champ={champ} />
        </div>
      ))}

      {process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ? (
        <>
          {/* Rendu implicite Cloudflare Turnstile : ajoute lui-même un champ
              caché "cf-turnstile-response" au submit du <form> englobant —
              aucun JavaScript applicatif à écrire pour le récupérer, voir
              soumettreReponseFormulaire() (src/lib/actions/one-form.ts). */}
          <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer />
          <div className="cf-turnstile" data-sitekey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY} />
        </>
      ) : null}

      {erreur ? <p className="text-sm text-destructive">{erreur}</p> : null}

      <Button type="submit" disabled={enCours} className="w-full">
        {enCours ? <Spinner /> : null}
        {enCours ? "Envoi…" : "Envoyer"}
      </Button>
    </form>
  );
}

function ChampFormulaire({ champ }: { champ: Champ }) {
  const requis = champ.obligatoire;

  switch (champ.type) {
    case "TEXTE_LONG":
      return <Textarea id={champ.id} name={champ.id} rows={4} required={requis} />;
    case "EMAIL":
      return <Input id={champ.id} name={champ.id} type="email" required={requis} />;
    case "TELEPHONE":
      return <Input id={champ.id} name={champ.id} type="tel" required={requis} />;
    case "NOMBRE":
      return <Input id={champ.id} name={champ.id} type="number" required={requis} />;
    case "DATE":
      return <Input id={champ.id} name={champ.id} type="date" required={requis} />;
    case "LISTE_DEROULANTE":
      return (
        <Select id={champ.id} name={champ.id} required={requis} defaultValue="">
          <option value="" disabled>
            Sélectionnez…
          </option>
          {(champ.options ?? []).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </Select>
      );
    case "CHOIX_UNIQUE":
      return (
        <div className="flex flex-col gap-1.5">
          {(champ.options ?? []).map((o) => (
            <label key={o} className="flex items-center gap-2 text-sm">
              <input type="radio" name={champ.id} value={o} required={requis} className="size-4" />
              {o}
            </label>
          ))}
        </div>
      );
    case "CHOIX_MULTIPLE":
      return (
        <div className="flex flex-col gap-1.5">
          {(champ.options ?? []).map((o) => (
            <label key={o} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name={champ.id} value={o} className="size-4" />
              {o}
            </label>
          ))}
        </div>
      );
    case "FICHIER":
      return <ChampFichier champ={champ} />;
    default:
      return <Input id={champ.id} name={champ.id} type="text" required={requis} />;
  }
}

const SEUIL_REDUCTION_OCTETS = 1.5 * 1024 * 1024;
const COTE_MAX_PIXELS = 2000;

/** Réduit une grosse photo (JPEG, qualité 85 %) pour tenir dans la limite d'envoi ; null si impossible (le fichier d'origine est alors gardé). */
async function reduireImage(fichier: File): Promise<File | null> {
  try {
    const image = await createImageBitmap(fichier);
    const echelle = Math.min(1, COTE_MAX_PIXELS / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(image.width * echelle);
    canvas.height = Math.round(image.height * echelle);
    canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    if (!blob || blob.size >= fichier.size) return null;
    return new File([blob], fichier.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return null;
  }
}

function ChampFichier({ champ }: { champ: Champ }) {
  const categories = categoriesDuChamp(champ.options);
  const [message, setMessage] = useState<string | null>(null);

  async function choisir(e: React.ChangeEvent<HTMLInputElement>) {
    const champSaisie = e.target;
    setMessage(null);
    let fichier = champSaisie.files?.[0];
    if (!fichier) return;

    if (fichier.type.startsWith("image/") && fichier.size > SEUIL_REDUCTION_OCTETS) {
      const reduit = await reduireImage(fichier);
      if (reduit) {
        const transfert = new DataTransfer();
        transfert.items.add(reduit);
        champSaisie.files = transfert.files;
        fichier = reduit;
      }
    }
    if (fichier.size > TAILLE_MAX_TOTAL_OCTETS) {
      champSaisie.value = "";
      setMessage(`Ce fichier fait ${formaterTaille(fichier.size)} : la taille maximale est ${TAILLE_MAX_TOTAL_LIBELLE}.`);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <input
        id={champ.id}
        name={champ.id}
        type="file"
        accept={attributAccept(categories)}
        required={champ.obligatoire}
        onChange={choisir}
        className="block w-full text-sm file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-muted file:px-3 file:py-2 file:text-sm file:font-medium"
      />
      <p className="text-xs text-muted-foreground">
        {libelleCategories(categories)} — {TAILLE_MAX_TOTAL_LIBELLE} maximum.
      </p>
      {message ? <p className="text-xs text-destructive">{message}</p> : null}
    </div>
  );
}
