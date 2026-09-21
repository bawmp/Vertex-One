"use client";

import { useActionState, useRef, useState } from "react";
import { Megaphone, Paperclip, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { Card, CardContent } from "@/components/ui/card";
import { creerAnnonce, type EtatAnnonce } from "@/lib/actions/annonce";
import { NB_MAX_PIECES_ANNONCE } from "@/lib/annonces/pieces";
import { attributAccept, CATEGORIES_FICHIER, formaterTaille, TAILLE_MAX_TOTAL_LIBELLE, TAILLE_MAX_TOTAL_OCTETS } from "@/lib/one-form/fichiers";
import { useT } from "@/lib/i18n/contexte";

export function FormulaireAnnonce() {
  const t = useT();
  const [cle, setCle] = useState(0);
  const [fichiers, setFichiers] = useState<File[]>([]);
  const [erreurLocale, setErreurLocale] = useState<string | null>(null);
  const champ = useRef<HTMLInputElement>(null);

  const [etat, action, enCours] = useActionState(async (precedent: EtatAnnonce, formData: FormData) => {
    const resultat = await creerAnnonce(precedent, formData);
    // Publiée : on repart d'un formulaire vierge (texte et fichiers).
    if (!resultat) {
      setFichiers([]);
      setCle((k) => k + 1);
    }
    return resultat;
  }, null);

  // Le champ fichier natif porte les fichiers envoyés : on le tient synchronisé avec la liste affichée (retirer un
  // fichier reconstruit sa liste).
  function synchroniser(liste: File[]) {
    const transfert = new DataTransfer();
    liste.forEach((f) => transfert.items.add(f));
    if (champ.current) champ.current.files = transfert.files;
    setFichiers(liste);
  }

  function choisir(e: React.ChangeEvent<HTMLInputElement>) {
    // Un fichier déjà dans la liste (même nom, taille et date) n'est pas ajouté une seconde fois.
    const memeFichier = (a: File, b: File) => a.name === b.name && a.size === b.size && a.lastModified === b.lastModified;
    const ajoutes = Array.from(e.target.files ?? []).filter((f) => !fichiers.some((existant) => memeFichier(existant, f)));
    const liste = [...fichiers, ...ajoutes].slice(0, NB_MAX_PIECES_ANNONCE + 1); // +1 : assez pour signaler le dépassement
    const total = liste.reduce((somme, f) => somme + f.size, 0);
    if (liste.length > NB_MAX_PIECES_ANNONCE) setErreurLocale(`Une annonce accepte ${NB_MAX_PIECES_ANNONCE} pièces jointes au maximum.`);
    else if (total > TAILLE_MAX_TOTAL_OCTETS) setErreurLocale(`Les pièces jointes dépassent ${TAILLE_MAX_TOTAL_LIBELLE} au total.`);
    else setErreurLocale(null);
    synchroniser(liste.slice(0, NB_MAX_PIECES_ANNONCE));
  }

  return (
    <Card>
      <CardContent>
        <form key={cle} action={action} className="flex flex-col gap-3">
          <Textarea name="contenu" placeholder={t("Écrire une annonce pour toute l'équipe…")} rows={3} />

          <input ref={champ} type="file" name="fichiers" multiple accept={attributAccept(CATEGORIES_FICHIER)} onChange={choisir} className="hidden" aria-label={t("Joindre des fichiers")} />
          {fichiers.length > 0 ? (
            <ul className="flex flex-wrap gap-2" aria-label={t("Pièces jointes de l'annonce")}>
              {fichiers.map((f, i) => (
                <li key={`${f.name}-${i}`} className="flex max-w-full items-center gap-2 rounded-lg border border-border bg-muted/50 px-2.5 py-1.5 text-sm">
                  <Paperclip className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="min-w-0 truncate">{f.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{formaterTaille(f.size)}</span>
                  <button type="button" onClick={() => synchroniser(fichiers.filter((_, j) => j !== i))} aria-label={`Retirer ${f.name}`}>
                    <X className="size-3.5 text-muted-foreground hover:text-destructive" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          {erreurLocale ? <p className="text-sm text-destructive">{erreurLocale}</p> : null}
          {etat?.erreur ? <p className="text-sm text-destructive">{etat.erreur}</p> : null}

          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => champ.current?.click()} disabled={enCours || fichiers.length >= NB_MAX_PIECES_ANNONCE}>
              <Paperclip data-icon="inline-start" aria-hidden />
              {t("Joindre des fichiers")}
            </Button>
            <Button type="submit" size="sm" disabled={enCours || Boolean(erreurLocale)}>
              {enCours ? <Spinner /> : <Megaphone data-icon="inline-start" aria-hidden />}
              {enCours ? t("Publication…") : t("Publier")}
            </Button>
            <span className="text-xs text-muted-foreground">
              {t("Image, PDF, Word ou Excel — {n} fichiers, {taille} au total", { n: NB_MAX_PIECES_ANNONCE, taille: TAILLE_MAX_TOTAL_LIBELLE })}
            </span>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
