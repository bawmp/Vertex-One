"use client";

import { useActionState, useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { creerFactureFournisseur } from "@/lib/actions/facture-fournisseur";
import { calculerMontants, formaterFCFA } from "@/lib/facturation/calcul";

type Ligne = { produitId: string; designation: string; quantite: string; prixUnitaire: string; tauxTVA: string };
const LIGNE_VIDE: Ligne = { produitId: "", designation: "", quantite: "1", prixUnitaire: "0", tauxTVA: "19.25" };

export function FormulaireFactureFournisseur({
  fournisseurs,
  comptesCharge,
  produits,
}: {
  fournisseurs: { id: string; nom: string }[];
  comptesCharge: { id: string; numero: string; libelle: string }[];
  produits: { id: string; nom: string; prixAchat: number }[];
}) {
  const [etat, action, enCours] = useActionState(creerFactureFournisseur, null);
  const [lignes, setLignes] = useState<Ligne[]>([{ ...LIGNE_VIDE }]);

  function majLigne(index: number, champ: keyof Ligne, valeur: string) {
    setLignes((precedent) => precedent.map((l, i) => (i === index ? { ...l, [champ]: valeur } : l)));
  }

  function choisirProduit(index: number, produitId: string) {
    const p = produits.find((p) => p.id === produitId);
    setLignes((precedent) =>
      precedent.map((l, i) =>
        i === index ? { ...l, produitId, designation: p ? p.nom : l.designation, prixUnitaire: p ? String(p.prixAchat) : l.prixUnitaire } : l
      )
    );
  }

  const montants = calculerMontants(
    lignes.map((l) => ({ quantite: Number(l.quantite) || 0, prixUnitaire: Number(l.prixUnitaire) || 0, tauxTVA: Number(l.tauxTVA) || 0 }))
  );

  return (
    <Card>
      <CardContent>
        <form action={action} className="flex flex-col gap-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="fournisseurId">Fournisseur</Label>
              <Select id="fournisseurId" name="fournisseurId" required defaultValue="">
                <option value="" disabled>
                  Choisir…
                </option>
                {fournisseurs.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.nom}
                  </option>
                ))}
              </Select>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="numero">Numéro de facture (du fournisseur)</Label>
              <Input id="numero" name="numero" required placeholder="ex : FA-2026-0456" />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="compteComptableId">Catégorie de charge</Label>
              <Select id="compteComptableId" name="compteComptableId" required defaultValue="">
                <option value="" disabled>
                  Choisir…
                </option>
                {comptesCharge.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.numero} — {c.libelle}
                  </option>
                ))}
              </Select>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="dateFacture">Date de la facture</Label>
              <Input id="dateFacture" name="dateFacture" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="dateEcheance">Date d&apos;échéance</Label>
              <Input id="dateEcheance" name="dateEcheance" type="date" required />
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
                  <Input name="designation" required value={ligne.designation} onChange={(e) => majLigne(index, "designation", e.target.value)} />
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

            <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => setLignes((p) => [...p, { ...LIGNE_VIDE }])}>
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
            {enCours ? "Création…" : "Créer la facture fournisseur"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
