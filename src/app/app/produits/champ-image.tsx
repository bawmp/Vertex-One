"use client";

import { useEffect, useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { preparerImage } from "@/lib/produits/redimensionner-image";
import { useT } from "@/lib/i18n/contexte";

const FORMATS = "image/jpeg,image/png,image/webp";

/**
 * Champ « image » d'un produit (création et fiche) : l'utilisateur choisit une photo (ou la prend avec son téléphone), voit un APERÇU, et la
 * photo est réduite automatiquement si elle est trop lourde. Le fichier réduit remplace celui du champ (`name="image"`) : le formulaire l'envoie
 * tel quel, aucune autre étape. Le serveur revérifie le contenu et la taille.
 */
export function ChampImage({ id = "image", requis = false, libelleVisible = true, onChoix }: { id?: string; requis?: boolean; /** Faux quand un titre voisin dit déjà « Image » (le libellé reste lu par les lecteurs d'écran). */ libelleVisible?: boolean; onChoix?: (aUnFichier: boolean) => void }) {
  const t = useT();
  const champ = useRef<HTMLInputElement>(null);
  const [apercu, setApercu] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);

  // Libère l'adresse temporaire de l'aperçu quand elle change ou que le champ disparaît.
  useEffect(() => () => { if (apercu) URL.revokeObjectURL(apercu); }, [apercu]);

  async function choisi(e: React.ChangeEvent<HTMLInputElement>) {
    const original = e.target.files?.[0];
    if (!original) return retirer();
    setOccupe(true);
    const pret = await preparerImage(original);
    setOccupe(false);
    // Le fichier réduit prend la place de celui choisi dans le champ : c'est lui que le formulaire enverra.
    if (pret !== original && champ.current) {
      const dt = new DataTransfer();
      dt.items.add(pret);
      champ.current.files = dt.files;
    }
    setApercu(URL.createObjectURL(pret));
    const ko = Math.max(1, Math.round(pret.size / 1024));
    setInfo(pret !== original ? t("Photo réduite automatiquement ({ko} Ko).", { ko }) : t("{ko} Ko", { ko }));
    onChoix?.(true);
  }

  function retirer() {
    if (champ.current) champ.current.value = "";
    setApercu(null);
    setInfo(null);
    onChoix?.(false);
  }

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id} className={libelleVisible ? undefined : "sr-only"}>{t("Image")}</Label>
      <div className="flex flex-wrap items-center gap-3">
        {apercu ? (
          // eslint-disable-next-line @next/next/no-img-element -- aperçu local (adresse temporaire du navigateur), jamais une image du serveur.
          <img src={apercu} alt={t("Aperçu de l'image")} className="size-16 shrink-0 rounded-lg border object-cover" />
        ) : (
          <div className="flex size-16 shrink-0 items-center justify-center rounded-lg border border-dashed bg-muted/40 text-muted-foreground" aria-hidden>
            <ImagePlus className="size-5" />
          </div>
        )}
        <div className="flex min-w-0 flex-col gap-1">
          <input ref={champ} id={id} name="image" type="file" accept={FORMATS} required={requis} onChange={choisi} className="max-w-64 text-sm file:mr-2 file:rounded-md file:border file:bg-background file:px-2 file:py-1 file:text-sm" />
          <p className="text-xs text-muted-foreground">{occupe ? t("Préparation de la photo…") : (info ?? t("JPEG, PNG ou WebP. Une grande photo est réduite toute seule."))}</p>
        </div>
        {apercu ? (
          <Button type="button" size="sm" variant="ghost" onClick={retirer} aria-label={t("Retirer l'image choisie")}>
            <X data-icon="inline-start" aria-hidden />
            {t("Retirer")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
