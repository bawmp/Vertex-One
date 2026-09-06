"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { FolderPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { creerClasseurDocumentFinancier } from "@/lib/actions/document-financier";

export function FormulaireNouveauClasseur() {
  const [etat, action, enCours] = useActionState(creerClasseurDocumentFinancier, null);
  const [ouvert, setOuvert] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const enCoursPrecedent = useRef(false);

  useEffect(() => {
    if (enCoursPrecedent.current && !enCours && !etat?.erreur) {
      formRef.current?.reset();
      setOuvert(false);
    }
    enCoursPrecedent.current = enCours;
  }, [enCours, etat]);

  if (!ouvert) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOuvert(true)}>
        <FolderPlus data-icon="inline-start" aria-hidden />
        Nouveau classeur
      </Button>
    );
  }

  return (
    <form ref={formRef} action={action} className="flex items-start gap-2">
      <Input name="nom" placeholder="ex : Contrats" required autoFocus className="w-48" />
      <Button type="submit" size="sm" disabled={enCours}>
        {enCours ? <Spinner /> : "Créer"}
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={() => setOuvert(false)}>
        Annuler
      </Button>
      {etat?.erreur ? <p className="text-sm text-destructive">{etat.erreur}</p> : null}
    </form>
  );
}
