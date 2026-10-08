"use client";

import { useState, useTransition } from "react";
import { Download, ShieldAlert, Trash2, PenTool } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { effacerDocument, demanderSuppressionDocument, traiterDemandeSuppressionDocument } from "@/lib/actions/document";
import { FormulaireDemandeSignature } from "./formulaire-demande-signature";
import { useT } from "@/lib/i18n/contexte";

const LIBELLE_CATEGORIE: Record<string, string> = {
  GENERAL: "Général",
  PIECE_IDENTITE: "Pièce d'identité",
  DONNEES_SANTE: "Données de santé",
  AUTRE_SENSIBLE: "Autre sensible",
};

export type DemandeSuppressionEnAttente = { id: string; demandeParNom: string; motif: string | null; creeLe: string };

export function ListeDocuments({
  documents,
  peutSupprimer,
  peutDemanderSignature = false,
  utilisateurId,
  peutDemander = false,
  peutTraiter = false,
  demandes,
}: {
  documents: { id: string; nom: string; categorie: string; televerseParId?: string }[];
  // Droit de suppression générale (Administrateur).
  peutSupprimer: boolean;
  peutDemanderSignature?: boolean;
  // Utilisateur connecté : l'auteur d'un document peut toujours le retirer lui-même.
  utilisateurId?: string;
  // Peut demander la suppression d'un document qu'il n'a pas ajouté (validée ensuite par l'Administrateur).
  peutDemander?: boolean;
  // Administrateur : voit qui a demandé une suppression, et approuve ou refuse.
  peutTraiter?: boolean;
  // Demandes en attente, par identifiant de document.
  demandes?: Record<string, DemandeSuppressionEnAttente>;
}) {
  const t = useT();
  const [documentEnSignature, setDocumentEnSignature] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();
  const [erreurDemande, setErreurDemande] = useState<{ id: string; message: string } | null>(null);

  if (documents.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("Aucun document pour le moment.")}</p>;
  }

  const sensible = (categorie: string) => categorie === "PIECE_IDENTITE" || categorie === "DONNEES_SANTE" || categorie === "AUTRE_SENSIBLE";
  // Le serveur revérifie tout : ceci ne fait que choisir quel bouton afficher.
  const peutSupprimerCeDocument = (d: { televerseParId?: string }) => peutSupprimer || (!!utilisateurId && d.televerseParId === utilisateurId);

  function demanderSuppression(documentId: string) {
    const motif = window.prompt(t("Motif de la demande de suppression (facultatif)")) ;
    if (motif === null) return; // annulé
    setErreurDemande(null);
    demarrer(async () => {
      const r = await demanderSuppressionDocument(documentId, motif);
      if (r.erreur) setErreurDemande({ id: documentId, message: r.erreur });
    });
  }

  function traiter(demandeId: string, decision: "APPROUVER" | "REFUSER") {
    if (decision === "APPROUVER" && !window.confirm(t("Supprimer définitivement ce document ?"))) return;
    setErreurDemande(null);
    demarrer(async () => {
      const r = await traiterDemandeSuppressionDocument(demandeId, decision);
      if (r.erreur) setErreurDemande({ id: Object.entries(demandes ?? {}).find(([, v]) => v.id === demandeId)?.[0] ?? "", message: r.erreur });
    });
  }

  return (
    <Card className="p-0">
      <div className="flex flex-col divide-y divide-border">
        {documents.map((d, index) => (
          <div key={d.id} className="flex flex-col">
            <div
              className="group/ligne relative flex animate-in fade-in items-center justify-between gap-3 overflow-hidden px-4 py-2.5 text-sm fill-mode-both duration-300 transition-colors hover:bg-muted/50"
              style={{ animationDelay: `${Math.min(index, 8) * 30}ms` }}
            >
              <span
                aria-hidden
                className="absolute inset-y-0 left-0 w-0.5 scale-y-0 bg-primary transition-transform duration-150 group-hover/ligne:scale-y-100"
              />
              <p className="flex min-w-0 items-center gap-1.5 truncate transition-transform duration-150 group-hover/ligne:translate-x-1">
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
                {demandes?.[d.id] ? <Badge variant="warning">{t("Suppression demandée")}</Badge> : null}
                {peutSupprimerCeDocument(d) ? (
                  <Button variant="ghost" size="icon-sm" onClick={() => effacerDocument(d.id)} aria-label={`Effacer ${d.nom}`} className="hover:text-destructive">
                    <Trash2 className="size-4" aria-hidden />
                  </Button>
                ) : peutDemander && !demandes?.[d.id] ? (
                  <Button variant="ghost" size="sm" disabled={enCours} onClick={() => demanderSuppression(d.id)} aria-label={`Demander la suppression de ${d.nom}`} className="hover:text-destructive">
                    <Trash2 data-icon="inline-start" aria-hidden />
                    {t("Demander la suppression")}
                  </Button>
                ) : null}
              </div>
            </div>
            {demandes?.[d.id] && peutTraiter ? (
              // Visible de l'Administrateur seulement : qui a demandé, quand, pourquoi — et la décision.
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-amber-50 px-4 py-2 text-xs dark:bg-amber-950/20">
                <p>
                  <strong>{demandes[d.id].demandeParNom}</strong> {t("a demandé la suppression")} · {new Date(demandes[d.id].creeLe).toLocaleDateString(t.locale)}
                  {demandes[d.id].motif ? <span className="text-muted-foreground"> — « {demandes[d.id].motif} »</span> : null}
                </p>
                <div className="flex gap-2">
                  <Button size="sm" variant="destructive" disabled={enCours} onClick={() => traiter(demandes[d.id].id, "APPROUVER")}>
                    {t("Approuver la suppression")}
                  </Button>
                  <Button size="sm" variant="outline" disabled={enCours} onClick={() => traiter(demandes[d.id].id, "REFUSER")}>
                    {t("Refuser")}
                  </Button>
                </div>
              </div>
            ) : null}
            {erreurDemande && erreurDemande.id === d.id ? <p className="border-t border-border px-4 py-2 text-xs text-destructive">{erreurDemande.message}</p> : null}
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
