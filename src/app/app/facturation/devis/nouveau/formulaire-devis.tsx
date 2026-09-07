"use client";

import { useActionState, useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { creerDevis } from "@/lib/actions/devis";
import { calculerMontants, formaterFCFA } from "@/lib/facturation/calcul";

type Ligne = { produitId: string; designation: string; quantite: string; prixUnitaire: string; tauxTVA: string };

const LIGNE_VIDE: Ligne = { produitId: "", designation: "", quantite: "1", prixUnitaire: "0", tauxTVA: "19.25" };

export function FormulaireDevis({
  dealId,
  contactId,
  produits,
}: {
  dealId?: string;
  contactId?: string;
  produits: { id: string; nom: string; prixVente: number }[];
}) {
  const [etat, action, enCours] = useActionState(creerDevis, null);
  const [lignes, setLignes] = useState<Ligne[]>([{ ...LIGNE_VIDE }]);

  function majLigne(index: number, champ: keyof Ligne, valeur: string) {
    setLignes((precedent) => precedent.map((l, i) => (i === index ? { ...l, [champ]: valeur } : l)));
  }

  // Choisir un produit du catalogue pré-remplit désignation/prix, sans
  // empêcher l'ajustement manuel ensuite — le texte libre reste toujours
  // possible en laissant "Aucun produit" (échange du 2026-09-07).
  function choisirProduit(index: number, produitId: string) {
    const p = produits.find((p) => p.id === produitId);
    setLignes((precedent) =>
      precedent.map((l, i) =>
        i === index ? { ...l, produitId, designation: p ? p.nom : l.designation, prixUnitaire: p ? String(p.prixVente) : l.prixUnitaire } : l
      )
    );
  }

  const montants = calculerMontants(
    lignes.map((l) => ({
      quantite: Number(l.quantite) || 0,
      prixUnitaire: Number(l.prixUnitaire) || 0,
      tauxTVA: Number(l.tauxTVA) || 0,
    }))
  );

  return (
    <Card className="mt-6">
      <CardContent>
        <form action={action} className="flex flex-col gap-6">
          {dealId ? <input type="hidden" name="dealId" value={dealId} /> : null}
          {contactId ? <input type="hidden" name="contactId" value={contactId} /> : null}

          <div className="flex flex-col gap-2">
            <Label htmlFor="dateValidite">Valide jusqu&apos;au</Label>
            <Input id="dateValidite" name="dateValidite" type="date" required className="max-w-48" />
          </div>

          <div className="flex flex-col gap-3">
            {lignes.map((ligne, index) => (
              <div
                key={index}
                className="grid grid-cols-[9rem_1fr_5rem_7rem_5rem_auto] items-end gap-2 rounded-lg border border-transparent p-1 transition-colors focus-within:border-border"
              >
                <input type="hidden" name="produitId" value={ligne.produitId} />
                <div className="flex flex-col gap-1">
                  {index === 0 ? <Label>Produit</Label> : null}
                  <Select value={ligne.produitId} onChange={(e) => choisirProduit(index, e.target.value)}>
                    <option value="">Texte libre</option>
                    {produits.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nom}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="flex flex-col gap-1">
                  {index === 0 ? <Label>Désignation</Label> : null}
                  <Input
                    name="designation"
                    required
                    value={ligne.designation}
                    onChange={(e) => majLigne(index, "designation", e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  {index === 0 ? <Label>Qté</Label> : null}
                  <Input
                    name="quantite"
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={ligne.quantite}
                    onChange={(e) => majLigne(index, "quantite", e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  {index === 0 ? <Label>Prix unit. (FCFA)</Label> : null}
                  <Input
                    name="prixUnitaire"
                    type="number"
                    min="0"
                    required
                    value={ligne.prixUnitaire}
                    onChange={(e) => majLigne(index, "prixUnitaire", e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  {index === 0 ? <Label>TVA %</Label> : null}
                  <Input
                    name="tauxTVA"
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={ligne.tauxTVA}
                    onChange={(e) => majLigne(index, "tauxTVA", e.target.value)}
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={lignes.length === 1}
                  onClick={() => setLignes((precedent) => precedent.filter((_, i) => i !== index))}
                  aria-label="Retirer la ligne"
                  className="text-muted-foreground hover:text-destructive"
                >
                  <X className="size-4" aria-hidden />
                </Button>
              </div>
            ))}

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="self-start"
              onClick={() => setLignes((p) => [...p, { ...LIGNE_VIDE }])}
            >
              <Plus data-icon="inline-start" aria-hidden />
              Ajouter une ligne
            </Button>
          </div>

          <div className="rounded-lg bg-muted/40 p-4 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Montant HT</span>
              <span className="tabular-nums">{formaterFCFA(montants.montantHT)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">TVA</span>
              <span className="tabular-nums">{formaterFCFA(montants.montantTVA)}</span>
            </div>
            <div className="mt-2 flex justify-between border-t pt-2 text-base font-medium">
              <span>Total TTC</span>
              <span className="tabular-nums">{formaterFCFA(montants.montantTTC)}</span>
            </div>
          </div>

          {etat?.erreur ? <p className="text-sm text-destructive">{etat.erreur}</p> : null}

          <Button type="submit" disabled={enCours} className="self-start">
            {enCours ? <Spinner /> : null}
            {enCours ? "Création…" : "Créer le devis"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
