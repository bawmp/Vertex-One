"use client";

import { useActionState, useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { creerRecuVente } from "@/lib/actions/recu-vente";
import { calculerMontants, formaterFCFA } from "@/lib/facturation/calcul";

type Ligne = { produitId: string; designation: string; quantite: string; prixUnitaire: string; tauxTVA: string };

const LIGNE_VIDE: Ligne = { produitId: "", designation: "", quantite: "1", prixUnitaire: "0", tauxTVA: "19.25" };

const MOYENS_PAIEMENT: { valeur: string; libelle: string }[] = [
  { valeur: "orange_money", libelle: "Orange Money" },
  { valeur: "mtn_momo", libelle: "MTN MoMo" },
  { valeur: "especes", libelle: "Espèces" },
  { valeur: "virement", libelle: "Virement" },
  { valeur: "manuel", libelle: "Autre" },
];

export function FormulaireRecuVente({ dealId, produits }: { dealId: string; produits: { id: string; nom: string; prixVente: number }[] }) {
  const [etat, action, enCours] = useActionState(creerRecuVente, null);
  const [lignes, setLignes] = useState<Ligne[]>([{ ...LIGNE_VIDE }]);

  function majLigne(index: number, champ: keyof Ligne, valeur: string) {
    setLignes((precedent) => precedent.map((l, i) => (i === index ? { ...l, [champ]: valeur } : l)));
  }

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
          <input type="hidden" name="dealId" value={dealId} />

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="moyenPaiement">Moyen de paiement</Label>
              <Select id="moyenPaiement" name="moyenPaiement" required defaultValue="manuel">
                {MOYENS_PAIEMENT.map((m) => (
                  <option key={m.valeur} value={m.valeur}>
                    {m.libelle}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="referenceTransaction">Référence de transaction (optionnel)</Label>
              <Input id="referenceTransaction" name="referenceTransaction" placeholder="Ex. ID de transaction Mobile Money" />
            </div>
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
              <span>Total encaissé</span>
              <span className="tabular-nums">{formaterFCFA(montants.montantTTC)}</span>
            </div>
          </div>

          {etat?.erreur ? <p className="text-sm text-destructive">{etat.erreur}</p> : null}

          <Button type="submit" disabled={enCours} className="self-start">
            {enCours ? <Spinner /> : null}
            {enCours ? "Création…" : "Créer le reçu de vente"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
