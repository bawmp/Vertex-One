"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { creerDepense } from "@/lib/actions/depense";

const MOYENS_PAIEMENT: { valeur: string; libelle: string }[] = [
  { valeur: "orange_money", libelle: "Orange Money" },
  { valeur: "mtn_momo", libelle: "MTN MoMo" },
  { valeur: "especes", libelle: "Espèces" },
  { valeur: "virement", libelle: "Virement" },
  { valeur: "manuel", libelle: "Autre" },
];

export function FormulaireNouvelleDepense({
  comptesCharge,
  fournisseurs,
  deals,
}: {
  comptesCharge: { id: string; numero: string; libelle: string }[];
  fournisseurs: { id: string; nom: string }[];
  deals: { id: string; titre: string }[];
}) {
  const [etat, action, enCours] = useActionState(creerDepense, null);
  const [ouvert, setOuvert] = useState(false);
  const [refacturable, setRefacturable] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const enCoursPrecedent = useRef(false);

  useEffect(() => {
    if (enCoursPrecedent.current && !enCours && !etat?.erreur) {
      formRef.current?.reset();
      setRefacturable(false);
      setOuvert(false);
    }
    enCoursPrecedent.current = enCours;
  }, [enCours, etat]);

  if (!ouvert) {
    return (
      <Button size="sm" onClick={() => setOuvert(true)}>
        <Plus data-icon="inline-start" aria-hidden />
        Nouvelle dépense
      </Button>
    );
  }

  return (
    <Card>
      <CardContent>
        <form ref={formRef} action={action} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="libelle">Libellé</Label>
            <Input id="libelle" name="libelle" required minLength={2} placeholder="ex : Carburant véhicule de service" />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
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
              <Label htmlFor="fournisseurId">Fournisseur (optionnel)</Label>
              <Select id="fournisseurId" name="fournisseurId" defaultValue="">
                <option value="">Aucun</option>
                {fournisseurs.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.nom}
                  </option>
                ))}
              </Select>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="montantHT">Montant HT (FCFA)</Label>
              <Input id="montantHT" name="montantHT" type="number" min={1} required />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="tauxTVA">TVA récupérable (%)</Label>
              <Input id="tauxTVA" name="tauxTVA" type="number" min={0} max={100} step={0.01} defaultValue={0} />
            </div>

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
              <Label htmlFor="datePaiement">Date</Label>
              <Input id="datePaiement" name="datePaiement" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} />
            </div>
          </div>

          {deals.length > 0 ? (
            <div className="flex flex-col gap-2 rounded-lg border border-dashed p-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="refacturable"
                  checked={refacturable}
                  onChange={(e) => setRefacturable(e.target.checked)}
                  className="size-4"
                />
                Refacturable à un client
              </label>
              {refacturable ? (
                <Select name="dealId" required defaultValue="">
                  <option value="" disabled>
                    Choisir un deal…
                  </option>
                  {deals.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.titre}
                    </option>
                  ))}
                </Select>
              ) : null}
            </div>
          ) : null}

          {etat?.erreur ? <p className="text-sm text-destructive">{etat.erreur}</p> : null}

          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={enCours}>
              {enCours ? <Spinner /> : null}
              {enCours ? "Enregistrement…" : "Enregistrer"}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setOuvert(false)}>
              Annuler
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
