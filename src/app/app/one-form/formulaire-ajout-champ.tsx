"use client";

import { useActionState, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { ajouterChamp } from "@/lib/actions/one-form";
import { CATEGORIES_FICHIER, LIBELLE_CATEGORIE, TAILLE_MAX_TOTAL_LIBELLE } from "@/lib/one-form/fichiers";

const TYPES_CHAMP: { valeur: string; libelle: string }[] = [
  { valeur: "TEXTE_COURT", libelle: "Texte court" },
  { valeur: "TEXTE_LONG", libelle: "Texte long" },
  { valeur: "EMAIL", libelle: "Email" },
  { valeur: "TELEPHONE", libelle: "Téléphone" },
  { valeur: "NOMBRE", libelle: "Nombre" },
  { valeur: "DATE", libelle: "Date" },
  { valeur: "CHOIX_UNIQUE", libelle: "Choix unique" },
  { valeur: "CHOIX_MULTIPLE", libelle: "Choix multiple" },
  { valeur: "LISTE_DEROULANTE", libelle: "Liste déroulante" },
  { valeur: "FICHIER", libelle: "Fichier (PDF, image…)" },
];

const TYPES_AVEC_OPTIONS = new Set(["CHOIX_UNIQUE", "CHOIX_MULTIPLE", "LISTE_DEROULANTE"]);

export function FormulaireAjoutChamp({ formulaireId }: { formulaireId: string }) {
  const [etat, action, enCours] = useActionState(ajouterChamp, null);
  const [type, setType] = useState("TEXTE_COURT");

  return (
    <form action={action} className="flex flex-col gap-3 rounded-lg border border-dashed p-3">
      <input type="hidden" name="formulaireId" value={formulaireId} />

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor="libelle">Libellé</Label>
          <Input id="libelle" name="libelle" placeholder="ex : Votre nom" required />
        </div>
        <div className="flex w-full flex-col gap-1.5 sm:w-48">
          <Label htmlFor="type">Type de champ</Label>
          <Select id="type" name="type" value={type} onChange={(e) => setType(e.target.value)}>
            {TYPES_CHAMP.map((t) => (
              <option key={t.valeur} value={t.valeur}>
                {t.libelle}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {TYPES_AVEC_OPTIONS.has(type) ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="options">Options (une par ligne)</Label>
          <Textarea id="options" name="options" rows={3} placeholder={"Option A\nOption B\nOption C"} />
        </div>
      ) : null}

      {type === "FICHIER" ? (
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1 text-sm font-medium">Formats acceptés</legend>
          {CATEGORIES_FICHIER.map((categorie) => (
            <label key={categorie} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="categories" value={categorie} defaultChecked className="size-4" />
              {LIBELLE_CATEGORIE[categorie]}
            </label>
          ))}
          <p className="text-xs text-muted-foreground">Taille maximale : {TAILLE_MAX_TOTAL_LIBELLE} au total par envoi. Les photos trop lourdes sont réduites automatiquement.</p>
        </fieldset>
      ) : null}

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="obligatoire" className="size-4" />
        Champ obligatoire
      </label>

      {etat?.erreur ? <p className="text-sm text-destructive">{etat.erreur}</p> : null}

      <Button type="submit" size="sm" disabled={enCours} className="self-start">
        {enCours ? <Spinner /> : <Plus data-icon="inline-start" aria-hidden />}
        Ajouter le champ
      </Button>
    </form>
  );
}
