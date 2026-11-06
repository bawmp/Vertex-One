"use client";

import { useState, useTransition } from "react";
import { CircleCheck, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { commanderProduits, type EtatReappro } from "@/lib/actions/reapprovisionnement";
import { formaterFCFA } from "@/lib/facturation/calcul";
import { useT } from "@/lib/i18n/contexte";
import type { LigneReappro } from "@/lib/produits/reapprovisionnement";

type Choix = { coche: boolean; quantite: string; fournisseurId: string };

/**
 * Liste de ce qu'il faut commander : tout est déjà coché et pré-rempli (quantité proposée, fournisseur habituel). On ajuste une quantité
 * ou un fournisseur si besoin, puis un seul bouton crée les bons de commande en brouillon, un par fournisseur.
 */
export function FormulaireReappro({ lignes, fournisseurs, peutCommander }: { lignes: LigneReappro[]; fournisseurs: { id: string; nom: string }[]; peutCommander: boolean }) {
  const t = useT();
  const [choix, setChoix] = useState<Record<string, Choix>>(() =>
    Object.fromEntries(lignes.map((l) => [l.produitId, { coche: l.quantiteSuggeree > 0 && l.fournisseurId !== null, quantite: String(l.quantiteSuggeree), fournisseurId: l.fournisseurId ?? "" }]))
  );
  const [etat, setEtat] = useState<EtatReappro>(null);
  const [enCours, startTransition] = useTransition();

  const maj = (id: string, valeurs: Partial<Choix>) => setChoix((c) => ({ ...c, [id]: { ...c[id], ...valeurs } }));
  const selection = lignes.filter((l) => choix[l.produitId]?.coche);
  const complet = selection.length > 0 && selection.every((l) => Number(choix[l.produitId].quantite) > 0 && choix[l.produitId].fournisseurId);
  const total = selection.reduce((s, l) => s + Math.max(Number(choix[l.produitId].quantite) || 0, 0) * l.prixAchat, 0);

  function commander() {
    setEtat(null);
    startTransition(async () => {
      const retour = await commanderProduits(selection.map((l) => ({ produitId: l.produitId, quantite: Number(choix[l.produitId].quantite), fournisseurId: choix[l.produitId].fournisseurId })));
      setEtat(retour);
      if (retour?.message) setChoix((c) => Object.fromEntries(Object.entries(c).map(([id, v]) => [id, { ...v, coche: false }])));
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-0">
        <div className="flex flex-col divide-y divide-border">
          {lignes.map((l) => {
            const c = choix[l.produitId];
            const couvert = l.quantiteSuggeree === 0;
            return (
              <div key={l.produitId} className="grid grid-cols-1 gap-3 px-4 py-3 text-sm sm:grid-cols-[auto_1fr_7rem_14rem] sm:items-center">
                <input type="checkbox" className="size-4 accent-primary" checked={c.coche} disabled={!peutCommander} onChange={(e) => maj(l.produitId, { coche: e.target.checked })} aria-label={t("Commander {nom}", { nom: l.nom })} />
                <div className="min-w-0">
                  <p className="truncate font-medium">{l.nom}</p>
                  <p className="text-xs text-muted-foreground">
                    {l.niveau === "RUPTURE" ? t("En rupture") : t("Stock bas")} · {t("en stock : {n}", { n: l.stockActuel })}
                    {l.reserve > 0 ? ` · ${t("dont {n} réservé(s)", { n: l.reserve })}` : ""}
                    {l.enCommande > 0 ? ` · ${t("déjà commandé : {n}", { n: l.enCommande })}` : ""}
                    {couvert ? ` · ${t("couvert par la commande en cours")}` : ""}
                  </p>
                </div>
                <input
                  type="number"
                  min={1}
                  step={1}
                  inputMode="numeric"
                  className="h-9 w-full rounded-lg border border-input bg-background px-2 text-right tabular-nums"
                  value={c.quantite}
                  disabled={!peutCommander}
                  onChange={(e) => maj(l.produitId, { quantite: e.target.value })}
                  aria-label={t("Quantité à commander pour {nom}", { nom: l.nom })}
                />
                <select
                  className="h-9 w-full rounded-lg border border-input bg-background px-2"
                  value={c.fournisseurId}
                  disabled={!peutCommander}
                  onChange={(e) => maj(l.produitId, { fournisseurId: e.target.value })}
                  aria-label={t("Fournisseur pour {nom}", { nom: l.nom })}
                >
                  <option value="">{t("Choisir un fournisseur…")}</option>
                  {fournisseurs.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.nom}
                    </option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>
      </Card>

      {peutCommander ? (
        <div className="flex flex-col gap-3">
          {selection.length > 0 ? <p className="text-sm text-muted-foreground">{t("{n} produit(s) sélectionné(s) — environ {total} hors taxe.", { n: selection.length, total: formaterFCFA(total) })}</p> : null}
          {etat?.erreur ? <p role="alert" className="text-sm text-destructive">{etat.erreur}</p> : null}
          {etat?.message ? (
            <p role="status" className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
              <CircleCheck className="size-4" aria-hidden />
              {etat.message}
            </p>
          ) : null}
          <Button type="button" className="self-start" disabled={!complet || enCours} onClick={commander}>
            {enCours ? <Spinner /> : <ShoppingCart data-icon="inline-start" aria-hidden />}
            {t("Créer les bons de commande")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
