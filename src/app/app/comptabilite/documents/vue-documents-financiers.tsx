"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Download, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import {
  deplacerDocumentFinancier,
  attacherDocumentFinancier,
  modifierMetadonneesDocumentFinancier,
  supprimerDocumentFinancier,
} from "@/lib/actions/document-financier";

type LigneDocument = {
  id: string;
  nom: string;
  classeurId: string | null;
  factureId: string | null;
  paiementId: string | null;
  fournisseurOuVendeur: string | null;
  montant: number | null;
  dateDocument: Date | null;
  creeLe: Date;
};
type Classeur = { id: string; nom: string };
type OptionSimple = { id: string; libelle: string };

export function VueDocumentsFinanciers({
  documents,
  classeurs,
  factures,
  paiements,
}: {
  documents: LigneDocument[];
  classeurs: Classeur[];
  factures: OptionSimple[];
  paiements: OptionSimple[];
}) {
  const [filtre, setFiltre] = useState<"TOUS" | "INBOX" | string>("TOUS");
  const [ligneOuverte, setLigneOuverte] = useState<string | null>(null);
  const [enCours, startTransition] = useTransition();

  const documentsFiltres =
    filtre === "TOUS" ? documents : filtre === "INBOX" ? documents.filter((d) => !d.classeurId) : documents.filter((d) => d.classeurId === filtre);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-1.5">
        {[{ id: "TOUS", nom: "Tous les fichiers" }, { id: "INBOX", nom: "Boîte de réception" }, ...classeurs].map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setFiltre(c.id)}
            className={cn(
              "rounded-full border px-3 py-1 text-sm transition-colors",
              filtre === c.id ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted"
            )}
          >
            {c.nom}
          </button>
        ))}
      </div>

      <Card className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">Fichier</th>
                <th className="px-4 py-2.5 font-medium">Classeur</th>
                <th className="px-4 py-2.5 font-medium">Rattaché à</th>
                <th className="px-4 py-2.5 font-medium">Fournisseur</th>
                <th className="px-4 py-2.5 font-medium">Montant</th>
                <th className="px-4 py-2.5 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {documentsFiltres.map((d) => {
                const typeRattachement = d.factureId ? "facture" : d.paiementId ? "paiement" : "aucun";
                const idRattachement = d.factureId ?? d.paiementId ?? "";
                return (
                  <>
                    <tr key={d.id} className="border-b last:border-0">
                      <td className="px-4 py-2.5">
                        <Link
                          href={`/app/comptabilite/documents/${d.id}`}
                          target="_blank"
                          className="flex items-center gap-1.5 font-medium hover:underline"
                        >
                          <Download className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                          {d.nom}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5">
                        <Select
                          aria-label={`Classeur de ${d.nom}`}
                          defaultValue={d.classeurId ?? ""}
                          disabled={enCours}
                          className="w-40"
                          onChange={(e) => startTransition(() => deplacerDocumentFinancier(d.id, e.target.value || null))}
                        >
                          <option value="">Boîte de réception</option>
                          {classeurs.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.nom}
                            </option>
                          ))}
                        </Select>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <Select
                            aria-label={`Type de rattachement de ${d.nom}`}
                            defaultValue={typeRattachement}
                            disabled={enCours}
                            className="w-28"
                            onChange={(e) => {
                              const type = e.target.value;
                              if (type === "aucun") startTransition(() => attacherDocumentFinancier(d.id, {}));
                            }}
                          >
                            <option value="aucun">Aucun</option>
                            <option value="facture">Facture</option>
                            <option value="paiement">Paiement</option>
                          </Select>
                          {typeRattachement !== "aucun" ? (
                            <Select
                              aria-label={`${typeRattachement === "facture" ? "Facture" : "Paiement"} rattaché à ${d.nom}`}
                              defaultValue={idRattachement}
                              disabled={enCours}
                              className="w-36"
                              onChange={(e) =>
                                startTransition(() =>
                                  attacherDocumentFinancier(
                                    d.id,
                                    typeRattachement === "facture" ? { factureId: e.target.value } : { paiementId: e.target.value }
                                  )
                                )
                              }
                            >
                              <option value="" disabled>
                                Choisir…
                              </option>
                              {(typeRattachement === "facture" ? factures : paiements).map((o) => (
                                <option key={o.id} value={o.id}>
                                  {o.libelle}
                                </option>
                              ))}
                            </Select>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">{d.fournisseurOuVendeur ?? "—"}</td>
                      <td className="px-4 py-2.5 tabular-nums text-muted-foreground">
                        {d.montant != null ? new Intl.NumberFormat("fr-FR").format(d.montant) + " FCFA" : "—"}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setLigneOuverte(ligneOuverte === d.id ? null : d.id)}
                          >
                            {ligneOuverte === d.id ? <ChevronUp aria-hidden /> : <ChevronDown aria-hidden />}
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-destructive"
                            onClick={() => {
                              if (confirm(`Supprimer définitivement « ${d.nom} » ?`)) {
                                startTransition(() => supprimerDocumentFinancier(d.id));
                              }
                            }}
                          >
                            <Trash2 aria-hidden />
                          </Button>
                        </div>
                      </td>
                    </tr>
                    {ligneOuverte === d.id ? (
                      <tr className="border-b bg-muted/20 last:border-0">
                        <td colSpan={6} className="px-4 py-3">
                          <FormulaireMetadonnees documentId={d.id} document={d} />
                        </td>
                      </tr>
                    ) : null}
                  </>
                );
              })}
              {documentsFiltres.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                    Aucun document ici pour le moment.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function FormulaireMetadonnees({ documentId, document: doc }: { documentId: string; document: LigneDocument }) {
  const [enCours, startTransition] = useTransition();
  const action = modifierMetadonneesDocumentFinancier.bind(null, documentId);

  return (
    <form
      action={(formData) =>
        startTransition(() => {
          action(null, formData);
        })
      }
      className="grid max-w-xl grid-cols-3 items-end gap-2"
    >
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground" htmlFor={`fournisseur-${documentId}`}>
          Fournisseur / vendeur
        </label>
        <Input id={`fournisseur-${documentId}`} name="fournisseurOuVendeur" defaultValue={doc.fournisseurOuVendeur ?? ""} />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground" htmlFor={`montant-${documentId}`}>
          Montant (FCFA)
        </label>
        <Input id={`montant-${documentId}`} name="montant" type="number" defaultValue={doc.montant ?? ""} />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground" htmlFor={`date-${documentId}`}>
          Date du document
        </label>
        <Input
          id={`date-${documentId}`}
          name="dateDocument"
          type="date"
          defaultValue={doc.dateDocument ? doc.dateDocument.toISOString().slice(0, 10) : ""}
        />
      </div>
      <div className="col-span-3">
        <Button type="submit" size="sm" disabled={enCours}>
          {enCours ? <Spinner /> : null}
          Enregistrer
        </Button>
      </div>
    </form>
  );
}
