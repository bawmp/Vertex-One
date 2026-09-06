"use client";

import { useActionState, useState } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { ajouterDocument } from "@/lib/actions/document";

export function FormulaireDocument({
  dossierId,
  projetId,
  consentementManquant,
}: {
  dossierId?: string;
  projetId?: string;
  consentementManquant: boolean;
}) {
  const [etat, action, enCours] = useActionState(ajouterDocument, null);
  const [categorie, setCategorie] = useState("GENERAL");
  const sensible = categorie === "PIECE_IDENTITE" || categorie === "DONNEES_SANTE";

  return (
    <form action={action} className="flex flex-col gap-3 rounded-lg border p-4">
      {dossierId ? <input type="hidden" name="dossierId" value={dossierId} /> : null}
      {projetId ? <input type="hidden" name="projetId" value={projetId} /> : null}

      <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
        <div className="flex flex-col gap-1">
          <Label htmlFor="fichier">Fichier</Label>
          <Input id="fichier" name="fichier" type="file" required />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="categorie">Catégorie</Label>
          <Select id="categorie" name="categorie" value={categorie} onChange={(e) => setCategorie(e.target.value)} className="w-44">
            <option value="GENERAL">Général</option>
            <option value="PIECE_IDENTITE">Pièce d&apos;identité</option>
            <option value="DONNEES_SANTE">Données de santé</option>
            <option value="AUTRE_SENSIBLE">Autre sensible</option>
          </Select>
        </div>
      </div>

      {sensible && consentementManquant ? (
        // Palier 3, section 9 — avertir sans bloquer : le consentement du
        // client final n'est pas encore tracé sur ce dossier.
        <p className="text-sm text-amber-700 dark:text-amber-400">
          Le consentement du client pour l&apos;enregistrement de ses données sensibles n&apos;a pas encore été renseigné sur ce dossier.
        </p>
      ) : null}

      {etat?.erreur ? <p className="text-sm text-destructive">{etat.erreur}</p> : null}

      <Button type="submit" size="sm" disabled={enCours} className="self-start">
        {enCours ? <Spinner /> : <Upload data-icon="inline-start" aria-hidden />}
        {enCours ? "Téléversement…" : "Ajouter"}
      </Button>
    </form>
  );
}
