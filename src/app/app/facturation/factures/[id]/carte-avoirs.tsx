"use client";

import { useState, useTransition } from "react";
import { CircleCheck, Undo2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { ChampZone } from "@/components/formulaire/champ";
import { emettreAvoirClient, type EtatAvoirClient } from "@/lib/actions/avoir-client";
import { calculerMontants, formaterFCFA } from "@/lib/facturation/calcul";
import { useT } from "@/lib/i18n/contexte";

export type LigneCreditablePourFormulaire = { ligneFactureId: string; designation: string; produitSuivi: boolean; prixUnitaire: number; tauxTVA: number; facturee: number; creditee: number; restant: number };
export type AvoirAffiche = { id: string; numero: string; motif: string; montantTTC: number; creeLe: string };

/**
 * Avoirs et retours d'une facture : la liste des avoirs déjà émis et, pour en émettre un, un tableau « ce qui a été facturé / déjà
 * crédité / quantité à créditer » avec une case « remettre en stock » pour les produits suivis. Le total de l'avoir se calcule pendant
 * la saisie. Les contrôles (quantités, lignes, stock) sont refaits côté serveur.
 */
export function CarteAvoirs({ factureId, lignes, avoirs, netRestant, peutCreer, gereStock }: { factureId: string; lignes: LigneCreditablePourFormulaire[]; avoirs: AvoirAffiche[]; netRestant: number; peutCreer: boolean; gereStock: boolean }) {
  const t = useT();
  const [ouvert, setOuvert] = useState(false);
  const [quantites, setQuantites] = useState<Record<string, string>>({});
  const [enStock, setEnStock] = useState<Record<string, boolean>>({});
  const [etat, setEtat] = useState<EtatAvoirClient>(null);
  const [cle, setCle] = useState(0);
  const [enCours, startTransition] = useTransition();

  const creditables = lignes.filter((l) => l.restant > 0);
  const calcul = calculerMontants(
    creditables
      .map((l) => ({ quantite: Math.min(Math.max(Number((quantites[l.ligneFactureId] ?? "").replace(",", ".")) || 0, 0), l.restant), prixUnitaire: l.prixUnitaire, tauxTVA: l.tauxTVA }))
      .filter((l) => l.quantite > 0)
  );

  function envoyer(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const donnees = new FormData(e.currentTarget);
    setEtat(null);
    startTransition(async () => {
      const resultat = await emettreAvoirClient(factureId, null, donnees);
      setEtat(resultat);
      if (resultat?.message) {
        setQuantites({});
        setEnStock({});
        setCle((k) => k + 1);
        setOuvert(false);
      }
    });
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-sm font-medium">
            <Undo2 className="size-4 text-muted-foreground" aria-hidden />
            {t("Avoirs et retours")}
          </h2>
          {peutCreer && creditables.length > 0 && !ouvert ? (
            <Button type="button" variant="outline" size="sm" onClick={() => setOuvert(true)}>
              {t("Créer un avoir")}
            </Button>
          ) : null}
        </div>

        {avoirs.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("Aucun avoir sur cette facture. Un avoir sert à rembourser ou créditer une partie seulement : retour de marchandises, geste commercial.")}</p>
        ) : (
          <div className="flex flex-col divide-y divide-border rounded-lg border text-sm">
            {avoirs.map((a) => (
              <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 font-medium">
                    {a.numero}
                    <Badge variant="neutral">{new Intl.DateTimeFormat(t.locale, { dateStyle: "medium" }).format(new Date(a.creeLe))}</Badge>
                  </p>
                  <p className="text-xs text-muted-foreground">{a.motif}</p>
                </div>
                <span className="tabular-nums font-medium">− {formaterFCFA(a.montantTTC)}</span>
              </div>
            ))}
            <div className="flex items-center justify-between gap-2 bg-muted/30 px-3 py-2 font-medium">
              <span>{t("Montant net de la facture après avoirs")}</span>
              <span className="tabular-nums">{formaterFCFA(netRestant)}</span>
            </div>
          </div>
        )}

        {etat?.message && !ouvert ? (
          <p role="status" className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
            <CircleCheck className="size-4" aria-hidden />
            {etat.message}
          </p>
        ) : null}

        {ouvert ? (
          <form key={cle} onSubmit={envoyer} className="flex flex-col gap-4" aria-label={t("Créer un avoir")}>
            <p className="text-sm text-muted-foreground">{t("Pour chaque ligne, tapez la quantité à créditer. Laissez vide ce qui ne change pas.")}</p>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                    <th className="px-3 py-2 font-medium">{t("Désignation")}</th>
                    <th className="px-3 py-2 text-right font-medium whitespace-nowrap">{t("Restant")}</th>
                    <th className="px-3 py-2 font-medium">{t("À créditer")}</th>
                    {gereStock ? <th className="px-3 py-2 font-medium">{t("Remettre en stock")}</th> : null}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {creditables.map((l) => (
                    <tr key={l.ligneFactureId}>
                      <td className="px-3 py-2">
                        <p className="font-medium">{l.designation}</p>
                        <p className="text-xs text-muted-foreground">
                          {t("Facturé {a}, déjà crédité {b}", { a: l.facturee, b: l.creditee })} · {formaterFCFA(l.prixUnitaire)}
                        </p>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{l.restant}</td>
                      <td className="px-3 py-2">
                        <Input
                          name={`quantite_${l.ligneFactureId}`}
                          type="number"
                          min={0}
                          max={l.restant}
                          step="any"
                          inputMode="decimal"
                          value={quantites[l.ligneFactureId] ?? ""}
                          onChange={(e) => setQuantites((q) => ({ ...q, [l.ligneFactureId]: e.target.value }))}
                          aria-label={t("Quantité à créditer pour {nom}", { nom: l.designation })}
                          className="w-24"
                        />
                      </td>
                      {gereStock ? (
                        <td className="px-3 py-2">
                          {l.produitSuivi ? (
                            <label className="flex items-center gap-2 text-xs">
                              <input type="checkbox" name={`stock_${l.ligneFactureId}`} checked={enStock[l.ligneFactureId] ?? false} onChange={(e) => setEnStock((s) => ({ ...s, [l.ligneFactureId]: e.target.checked }))} className="size-4 accent-primary" />
                              {t("Article en bon état")}
                            </label>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ChampZone label={t("Motif de l'avoir")} name="motif" required minLength={3} maxLength={300} rows={2} />
            <p className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
              <span className="text-muted-foreground">{t("Montant de l'avoir (TVA comprise)")}</span>
              <span className="text-lg font-semibold tabular-nums">{formaterFCFA(calcul.montantTTC)}</span>
            </p>
            {etat?.erreur ? <p role="alert" className="text-sm text-destructive">{etat.erreur}</p> : null}
            <div className="flex gap-2">
              <Button type="submit" disabled={enCours || calcul.montantTTC <= 0}>
                {enCours ? <Spinner /> : null}
                {t("Émettre l'avoir")}
              </Button>
              <Button type="button" variant="ghost" disabled={enCours} onClick={() => { setOuvert(false); setEtat(null); }}>
                {t("Annuler")}
              </Button>
            </div>
          </form>
        ) : null}
      </CardContent>
    </Card>
  );
}
