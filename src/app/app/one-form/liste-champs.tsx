"use client";

import { useActionState, useState, useTransition } from "react";
import { ArrowUp, ArrowDown, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { modifierChamp, reordonnerChamps, supprimerChamp } from "@/lib/actions/one-form";
import { CATEGORIES_FICHIER, LIBELLE_CATEGORIE, categoriesDuChamp, libelleCategories } from "@/lib/one-form/fichiers";

const LIBELLE_TYPE: Record<string, string> = {
  TEXTE_COURT: "Texte court",
  TEXTE_LONG: "Texte long",
  EMAIL: "Email",
  TELEPHONE: "Téléphone",
  NOMBRE: "Nombre",
  DATE: "Date",
  CHOIX_UNIQUE: "Choix unique",
  CHOIX_MULTIPLE: "Choix multiple",
  LISTE_DEROULANTE: "Liste déroulante",
  FICHIER: "Fichier",
};

type Champ = { id: string; libelle: string; type: string; obligatoire: boolean; options?: string[] | null };

const TYPES_AVEC_OPTIONS = new Set(["CHOIX_UNIQUE", "CHOIX_MULTIPLE", "LISTE_DEROULANTE"]);

/** Édition d'un champ : libellé, obligatoire, et choix / formats. Le type ne change pas (des réponses en dépendent). */
function EditionChamp({ champ, formulaireId, fermer }: { champ: Champ; formulaireId: string; fermer: () => void }) {
  const [etat, action, enCours] = useActionState(async (precedent: { erreur?: string } | null, formData: FormData) => {
    const resultat = await modifierChamp(precedent, formData);
    if (!resultat) fermer();
    return resultat;
  }, null);
  const categories = categoriesDuChamp(champ.options);

  return (
    <form action={action} className="flex flex-col gap-3 bg-muted/30 px-3 py-3">
      <input type="hidden" name="champId" value={champ.id} />
      <input type="hidden" name="formulaireId" value={formulaireId} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`libelle-${champ.id}`}>Libellé ({LIBELLE_TYPE[champ.type] ?? champ.type})</Label>
        <Input id={`libelle-${champ.id}`} name="libelle" defaultValue={champ.libelle} required />
      </div>
      {TYPES_AVEC_OPTIONS.has(champ.type) ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`options-${champ.id}`}>Options (une par ligne)</Label>
          <Textarea id={`options-${champ.id}`} name="options" rows={4} defaultValue={(champ.options ?? []).join("\n")} />
        </div>
      ) : null}
      {champ.type === "FICHIER" ? (
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1 text-sm font-medium">Formats acceptés</legend>
          {CATEGORIES_FICHIER.map((categorie) => (
            <label key={categorie} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="categories" value={categorie} defaultChecked={categories.includes(categorie)} className="size-4" />
              {LIBELLE_CATEGORIE[categorie]}
            </label>
          ))}
        </fieldset>
      ) : null}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="obligatoire" defaultChecked={champ.obligatoire} className="size-4" />
        Champ obligatoire
      </label>
      {etat?.erreur ? <p className="text-sm text-destructive">{etat.erreur}</p> : null}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={enCours}>
          {enCours ? <Spinner /> : null}
          Enregistrer
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={fermer}>
          Annuler
        </Button>
      </div>
    </form>
  );
}

export function ListeChamps({ formulaireId, champsInitiaux, peutModifier }: { formulaireId: string; champsInitiaux: Champ[]; peutModifier: boolean }) {
  const [champs, setChamps] = useState(champsInitiaux);
  const [enCours, startTransition] = useTransition();
  const [enEditionId, setEnEditionId] = useState<string | null>(null);

  // champsInitiaux se rafraîchit après ajout/suppression d'un champ ailleurs
  // sur la page (revalidatePath, voir src/lib/actions/one-form.ts) — sans
  // cette synchronisation, useState(champsInitiaux) ne capturerait que la
  // valeur du tout premier rendu et la liste locale ne verrait jamais les
  // champs ajoutés depuis FormulaireAjoutChamp (bug réel trouvé en testant en
  // navigateur réel : "Ajouter le champ" réussissait côté serveur mais la
  // liste restait affichée comme vide). Ajustement pendant le rendu plutôt
  // que dans un effet (idiome React recommandé, évite un rendu en cascade) —
  // champsInitiaux n'est une référence stable que tant que le Server
  // Component parent n'a pas relu la base.
  const [champsPrecedents, setChampsPrecedents] = useState(champsInitiaux);
  if (champsInitiaux !== champsPrecedents) {
    setChampsPrecedents(champsInitiaux);
    setChamps(champsInitiaux);
  }

  function deplacer(index: number, direction: -1 | 1) {
    const cible = index + direction;
    if (cible < 0 || cible >= champs.length) return;
    const nouveaux = [...champs];
    [nouveaux[index], nouveaux[cible]] = [nouveaux[cible], nouveaux[index]];
    setChamps(nouveaux);
    startTransition(() => reordonnerChamps(formulaireId, nouveaux.map((c) => c.id)));
  }

  function supprimer(champId: string) {
    if (!window.confirm("Supprimer ce champ ?")) return;
    setChamps((prev) => prev.filter((c) => c.id !== champId));
    startTransition(() => supprimerChamp(champId, formulaireId));
  }

  if (champs.length === 0) {
    return <p className="text-sm text-muted-foreground">Aucun champ pour le moment — ajoutez-en un ci-dessous.</p>;
  }

  return (
    <div className="flex flex-col divide-y divide-border rounded-lg border border-border">
      {champs.map((champ, index) => (
        <div key={champ.id}>
        <div className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
          <div className="flex items-center gap-2">
            <span className="font-medium">{champ.libelle}</span>
            <Badge variant="neutral">{LIBELLE_TYPE[champ.type] ?? champ.type}</Badge>
            {champ.type === "FICHIER" ? <span className="text-xs text-muted-foreground">{libelleCategories(categoriesDuChamp(champ.options))}</span> : null}
            {champ.obligatoire ? <Badge variant="warning">Obligatoire</Badge> : null}
          </div>
          {peutModifier ? (
            <div className="flex items-center gap-1">
              {enCours ? <Spinner className="size-3.5" /> : null}
              <Button variant="ghost" size="icon-sm" disabled={index === 0} onClick={() => deplacer(index, -1)} aria-label="Monter">
                <ArrowUp className="size-3.5" aria-hidden />
              </Button>
              <Button variant="ghost" size="icon-sm" disabled={index === champs.length - 1} onClick={() => deplacer(index, 1)} aria-label="Descendre">
                <ArrowDown className="size-3.5" aria-hidden />
              </Button>
              <Button variant="ghost" size="icon-sm" onClick={() => setEnEditionId(enEditionId === champ.id ? null : champ.id)} aria-label="Modifier ce champ">
                <Pencil className="size-3.5" aria-hidden />
              </Button>
              <Button variant="ghost" size="icon-sm" onClick={() => supprimer(champ.id)} aria-label="Supprimer">
                <Trash2 className="size-3.5" aria-hidden />
              </Button>
            </div>
          ) : null}
        </div>
        {peutModifier && enEditionId === champ.id ? <EditionChamp champ={champ} formulaireId={formulaireId} fermer={() => setEnEditionId(null)} /> : null}
        </div>
      ))}
    </div>
  );
}
