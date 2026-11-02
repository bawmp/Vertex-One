"use client";

import { useState, useTransition } from "react";
import { CircleCheck, Layers, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Champ, ChampSelect } from "@/components/formulaire/champ";
import { ajouterLotProduit, definirSuiviLotsProduit, retirerLotProduit, type EtatLots } from "@/lib/actions/lots";
import { MOTIFS_RETRAIT } from "@/lib/produits/motifs-stock";
import { useT } from "@/lib/i18n/contexte";

export type LotClient = { id: string; numeroLot: string; datePeremption: string | null; quantite: number; statut: "SANS_DATE" | "OK" | "BIENTOT" | "PERIME"; jours: number | null };

/**
 * Lots et dates de péremption d'un produit. Les lots découpent le stock (ce n'est pas un second stock) ; une vente sort d'abord le lot
 * qui se périme le plus tôt. Ajouter un lot : soit du stock déjà là (« sans lot »), soit une nouvelle réception. Contrôles refaits
 * côté serveur.
 */
export function LotsProduit({ produitId, suiviLots, lots, sansLot }: { produitId: string; suiviLots: boolean; lots: LotClient[]; sansLot: number }) {
  const t = useT();
  const [etat, setEtat] = useState<EtatLots>(null);
  const [enCours, startTransition] = useTransition();
  const [motif, setMotif] = useState("PERIME");

  const retour = etat?.erreur ? (
    <p role="alert" className="text-sm text-destructive">{etat.erreur}</p>
  ) : etat?.message ? (
    <p role="status" className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
      <CircleCheck className="size-4" aria-hidden />
      {etat.message}
    </p>
  ) : null;

  const badge = (l: LotClient) =>
    l.statut === "PERIME" ? <Badge variant="danger">{t("Périmé")}</Badge> : l.statut === "BIENTOT" ? <Badge variant="warning">{t("Bientôt périmé : {n} j", { n: l.jours ?? 0 })}</Badge> : l.statut === "OK" ? <Badge variant="success">{t("Valable")}</Badge> : <Badge variant="neutral">{t("Sans date")}</Badge>;

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <Layers className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
          <div className="flex-1">
            <h2 className="text-sm font-medium">{t("Lots et péremption")}</h2>
            <p className="text-sm text-muted-foreground">{t("Découpez le stock en lots avec une date de péremption : les ventes sortent d'abord ce qui se périme le plus tôt, et les lots à surveiller sont listés.")}</p>
          </div>
        </div>

        {!suiviLots ? (
          <Button type="button" variant="outline" className="self-start" disabled={enCours} onClick={() => { setEtat(null); startTransition(async () => setEtat(await definirSuiviLotsProduit(produitId, true))); }}>
            {enCours ? <Spinner /> : null}
            {t("Activer le suivi par lots")}
          </Button>
        ) : (
          <>
            <div className="flex flex-col divide-y divide-border rounded-lg border">
              {lots.map((l) => (
                <div key={l.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium">{t("Lot {numero}", { numero: l.numeroLot })}</p>
                    <p className="text-xs text-muted-foreground">{l.datePeremption ? t("périme le {date}", { date: l.datePeremption.split("-").reverse().join("/") }) : t("sans date de péremption")}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {badge(l)}
                    <span className="w-14 text-right tabular-nums">{l.quantite}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t("Retirer le lot {numero} du stock", { numero: l.numeroLot })}
                      className="text-muted-foreground hover:text-destructive"
                      disabled={enCours}
                      onClick={() => {
                        if (!window.confirm(t("Retirer {n} unité(s) du lot {numero} du stock ? Motif : {motif}.", { n: l.quantite, numero: l.numeroLot, motif: t(MOTIFS_RETRAIT[motif as keyof typeof MOTIFS_RETRAIT]) }))) return;
                        setEtat(null);
                        startTransition(async () => setEtat(await retirerLotProduit(l.id, produitId, motif)));
                      }}
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </Button>
                  </div>
                </div>
              ))}
              {sansLot > 0 ? (
                <div className="flex items-center justify-between px-3 py-2 text-sm text-muted-foreground">
                  <span>{t("Stock sans lot")}</span>
                  <span className="tabular-nums">{sansLot}</span>
                </div>
              ) : null}
              {lots.length === 0 && sansLot === 0 ? <p className="px-3 py-4 text-center text-sm text-muted-foreground">{t("Aucun lot pour le moment.")}</p> : null}
            </div>
            {lots.length > 0 ? (
              <ChampSelect label={t("Motif en cas de retrait d'un lot")} name="motifRetrait" value={motif} onChange={(e) => setMotif(e.target.value)} className="w-72">
                {Object.entries(MOTIFS_RETRAIT).map(([cle, libelle]) => (
                  <option key={cle} value={cle}>
                    {t(libelle)}
                  </option>
                ))}
              </ChampSelect>
            ) : null}

            <form
              className="flex flex-col gap-3 rounded-lg border p-3"
              aria-label={t("Ajouter un lot")}
              onSubmit={(e) => {
                e.preventDefault();
                const form = e.currentTarget;
                const donnees = new FormData(form);
                setEtat(null);
                startTransition(async () => {
                  const r = await ajouterLotProduit(produitId, null, donnees);
                  setEtat(r);
                  if (r?.message) form.reset();
                });
              }}
            >
              <div className="flex flex-wrap items-start gap-3">
                <Champ label={t("Numéro de lot")} name="numeroLot" required maxLength={40} className="w-48" />
                <Champ label={t("Date de péremption")} name="datePeremption" type="date" className="w-52" />
                <Champ label={t("Quantité")} name="quantite" type="number" min={1} step={1} inputMode="numeric" required className="w-36" />
                <ChampSelect label={t("D'où vient-il ?")} name="origine" defaultValue={sansLot > 0 ? "STOCK" : "ENTREE"} className="w-72">
                  <option value="STOCK">{t("Déjà en stock ({n} sans lot)", { n: sansLot })}</option>
                  <option value="ENTREE">{t("Nouvelle entrée de marchandise")}</option>
                </ChampSelect>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={enCours}>
                  {enCours ? <Spinner /> : <Plus data-icon="inline-start" aria-hidden />}
                  {t("Ajouter le lot")}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={enCours}
                  onClick={() => {
                    if (!window.confirm(t("Désactiver le suivi par lots ? Les lots sont effacés, le stock ne change pas."))) return;
                    setEtat(null);
                    startTransition(async () => setEtat(await definirSuiviLotsProduit(produitId, false)));
                  }}
                >
                  {t("Désactiver le suivi par lots")}
                </Button>
              </div>
            </form>
          </>
        )}
        {retour}
      </CardContent>
    </Card>
  );
}
