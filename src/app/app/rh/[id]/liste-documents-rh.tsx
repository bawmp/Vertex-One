import { Download, Trash2, FileText } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { effacerDocumentRH } from "@/lib/actions/document-rh";

type DocumentRH = { id: string; nom: string; tailleOctets: number; televerseParNom: string; creeLe: Date };

function formaterTaille(octets: number): string {
  if (octets < 1024) return `${octets} o`;
  if (octets < 1024 * 1024) return `${Math.round(octets / 1024)} Ko`;
  return `${(octets / (1024 * 1024)).toFixed(1)} Mo`;
}

export function ListeDocumentsRH({ documents, dossierRHId, peutSupprimer }: { documents: DocumentRH[]; dossierRHId: string; peutSupprimer: boolean }) {
  if (documents.length === 0) {
    return <p className="text-sm text-muted-foreground">Aucun fichier pour le moment.</p>;
  }

  return (
    <Card className="p-0">
      <div className="flex flex-col divide-y divide-border">
        {documents.map((d) => (
          <div key={d.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
            <div className="flex items-center gap-2 min-w-0">
              <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <div className="min-w-0">
                <p className="truncate font-medium">{d.nom}</p>
                <p className="text-xs text-muted-foreground">
                  {formaterTaille(d.tailleOctets)} — {d.televerseParNom} — {new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(d.creeLe)}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <a
                href={`/app/rh/${dossierRHId}/fichiers/${d.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground"
                aria-label={`Télécharger ${d.nom}`}
              >
                <Download className="size-4" aria-hidden />
              </a>
              {peutSupprimer ? (
                <form action={effacerDocumentRH.bind(null, d.id)}>
                  <Button type="submit" size="icon-xs" variant="ghost" className="text-muted-foreground hover:text-destructive" aria-label="Supprimer">
                    <Trash2 className="size-3.5" aria-hidden />
                  </Button>
                </form>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
