"use client";

import { useState } from "react";
import { Download, ShieldAlert, Trash2, PenTool } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { effacerDocument } from "@/lib/actions/document";
import { FormulaireDemandeSignature } from "./formulaire-demande-signature";

const LIBELLE_CATEGORIE: Record<string, string> = {
  GENERAL: "Général",
  PIECE_IDENTITE: "Pièce d'identité",
  DONNEES_SANTE: "Données de santé",
  AUTRE_SENSIBLE: "Autre sensible",
};

export function ListeDocuments({
  documents,
  peutSupprimer,
  peutDemanderSignature = false,
}: {
  documents: { id: string; nom: string; categorie: string }[];
  peutSupprimer: boolean;
  peutDemanderSignature?: boolean;
}) {
  const [documentEnSignature, setDocumentEnSignature] = useState<string | null>(null);

  if (documents.length === 0) {
    return <p className="text-sm text-muted-foreground">Aucun document pour le moment.</p>;
  }

  const sensible = (categorie: string) => categorie === "PIECE_IDENTITE" || categorie === "DONNEES_SANTE";

  return (
    <Card className="p-0">
      <div className="flex flex-col divide-y divide-border">
        {documents.map((d) => (
          <div key={d.id} className="flex flex-col">
            <div className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
              <p className="flex min-w-0 items-center gap-1.5 truncate">
                {sensible(d.categorie) ? <ShieldAlert className="size-3.5 shrink-0 text-amber-600" aria-hidden /> : null}
                <span className="truncate">{d.nom}</span>
              </p>
              <div className="flex shrink-0 items-center gap-2">
                <Badge variant={sensible(d.categorie) ? "warning" : "neutral"}>{LIBELLE_CATEGORIE[d.categorie]}</Badge>
                <a href={`/app/documents/${d.id}`} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground" aria-label={`Télécharger ${d.nom}`}>
                  <Download className="size-4" aria-hidden />
                </a>
                {peutDemanderSignature ? (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setDocumentEnSignature(documentEnSignature === d.id ? null : d.id)}
                    aria-label={`Demander une signature pour ${d.nom}`}
                    className={documentEnSignature === d.id ? "text-primary" : undefined}
                  >
                    <PenTool className="size-4" aria-hidden />
                  </Button>
                ) : null}
                {peutSupprimer ? (
                  <Button variant="ghost" size="icon-sm" onClick={() => effacerDocument(d.id)} aria-label={`Effacer ${d.nom}`} className="hover:text-destructive">
                    <Trash2 className="size-4" aria-hidden />
                  </Button>
                ) : null}
              </div>
            </div>
            {documentEnSignature === d.id ? (
              <div className="border-t border-border bg-muted/30 px-4 py-3">
                <FormulaireDemandeSignature documentId={d.id} />
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </Card>
  );
}
