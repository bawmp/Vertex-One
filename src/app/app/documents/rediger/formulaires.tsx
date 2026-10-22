"use client";

import { useActionState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { creerDocumentRedige, supprimerDocumentRedige } from "@/lib/actions/redaction";

export function FormulaireNouveauDocument() {
  const [etat, action, enCours] = useActionState(creerDocumentRedige, null);
  return (
    <form action={action} className="flex flex-wrap items-end gap-3 rounded-xl border border-border p-4">
      <div className="flex min-w-60 flex-1 flex-col gap-1">
        <Label htmlFor="nouveau-titre">Titre du nouveau document</Label>
        <Input id="nouveau-titre" name="titre" required maxLength={150} placeholder="ex. Contrat de prestation — Awa Nkolo" />
      </div>
      <Button type="submit" disabled={enCours}>
        {enCours ? <Spinner /> : null} Créer et rédiger
      </Button>
      {etat?.erreur ? (
        <p role="alert" className="w-full text-sm text-destructive">
          {etat.erreur}
        </p>
      ) : null}
    </form>
  );
}

export function BoutonSupprimerDocument({ id, titre }: { id: string; titre: string }) {
  const [enCours, startTransition] = useTransition();
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      aria-label={`Supprimer « ${titre} »`}
      disabled={enCours}
      onClick={() => {
        if (confirm(`Supprimer définitivement « ${titre} » ? Les fichiers déjà ajoutés à vos documents ne sont pas supprimés.`)) startTransition(() => void supprimerDocumentRedige(id));
      }}
    >
      <Trash2 aria-hidden />
    </Button>
  );
}
