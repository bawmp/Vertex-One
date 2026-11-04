"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { CircleCheck, Hash, Plus, RotateCcw, Search, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Champ, ChampSelect, ChampZone } from "@/components/formulaire/champ";
import { ajouterSeriesProduit, definirGarantieProduit, definirSuiviSerieProduit, remettreSerieProduit, retirerSerieProduit, type EtatSeries } from "@/lib/actions/series";
import { MOTIFS_RETRAIT } from "@/lib/produits/motifs-stock";
import { etatGarantie, lireSeries } from "@/lib/produits/series-regles";
import { useT } from "@/lib/i18n/contexte";

export type SerieClient = { id: string; numero: string; statut: "EN_STOCK" | "VENDU" | "RETIRE"; venduLe: string | null; lien: string | null; garantieFin: string | null; garantieFinTexte: string | null };

/**
 * Numéros de série d'un produit : un numéro par unité, de l'entrée à la vente. Une vente emporte toute seule les plus anciens numéros en
 * stock ; annuler la vente les remet en stock. Ajouter : unités déjà en stock (sans numéro) ou nouvelle entrée. Contrôles refaits côté serveur.
 */
export function SeriesProduit({ produitId, suiviSerie, suiviLots, series, enStock, sansNumero, dureeGarantieMois, aujourdhui }: { produitId: string; suiviSerie: boolean; suiviLots: boolean; series: SerieClient[]; enStock: number; sansNumero: number; dureeGarantieMois: number | null; aujourdhui: string }) {
  const t = useT();
  const [etat, setEtat] = useState<EtatSeries>(null);
  const [enCours, startTransition] = useTransition();
  const [motif, setMotif] = useState("CASSE");
  const [saisie, setSaisie] = useState("");
  const [garantie, setGarantie] = useState(dureeGarantieMois === null ? "" : String(dureeGarantieMois));
  const apercu = lireSeries(saisie);

  const retour = etat?.erreur ? (
    <p role="alert" className="text-sm text-destructive">{etat.erreur}</p>
  ) : etat?.message ? (
    <p role="status" className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
      <CircleCheck className="size-4" aria-hidden />
      {etat.message}
    </p>
  ) : null;

  const badge = (s: SerieClient) => (s.statut === "EN_STOCK" ? <Badge variant="success">{t("En stock")}</Badge> : s.statut === "VENDU" ? <Badge variant="info">{t("Vendu")}</Badge> : <Badge variant="neutral">{t("Retiré")}</Badge>);

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <Hash className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
          <div className="flex-1">
            <h2 className="text-sm font-medium">{t("Numéros de série")}</h2>
            <p className="text-sm text-muted-foreground">{t("Un numéro par unité (téléphone, appareil…) : une vente emporte toute seule les plus anciens numéros en stock, et vous retrouvez à qui chaque numéro a été vendu.")}</p>
          </div>
          <Button variant="outline" size="sm" render={<Link href="/app/produits/series" />} nativeButton={false}>
            <Search data-icon="inline-start" aria-hidden />
            {t("Chercher un numéro")}
          </Button>
        </div>

        {!suiviSerie ? (
          <>
            <Button type="button" variant="outline" className="self-start" disabled={enCours || suiviLots} onClick={() => { setEtat(null); startTransition(async () => setEtat(await definirSuiviSerieProduit(produitId, true))); }}>
              {enCours ? <Spinner /> : null}
              {t("Activer le suivi par numéro de série")}
            </Button>
            {suiviLots ? <p className="text-xs text-muted-foreground">{t("Ce produit suit ses lots : désactivez-les d'abord (un produit n'a pas les deux).")}</p> : null}
          </>
        ) : (
          <>
            <div className="flex flex-col divide-y divide-border rounded-lg border">
              {series.map((s) => (
                <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium tabular-nums">{s.numero}</p>
                    {s.statut === "VENDU" ? (
                      <p className="text-xs text-muted-foreground">
                        {s.venduLe ? t("vendu le {date}", { date: s.venduLe }) : t("vendu")}
                        {s.lien ? <> · <Link href={s.lien} className="underline-offset-4 hover:underline">{t("voir le document")}</Link></> : null}
                      </p>
                    ) : null}
                    {s.statut === "VENDU" && s.garantieFin && s.garantieFinTexte ? (
                      <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                        {t("Garantie jusqu'au {date}", { date: s.garantieFinTexte })}
                        {etatGarantie(s.garantieFin, aujourdhui) === "EXPIREE" ? <Badge variant="danger">{t("Expirée")}</Badge> : etatGarantie(s.garantieFin, aujourdhui) === "BIENTOT" ? <Badge variant="warning">{t("Se termine bientôt")}</Badge> : <Badge variant="success">{t("Sous garantie")}</Badge>}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    {badge(s)}
                    {s.statut === "EN_STOCK" ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t("Retirer le numéro {numero} du stock", { numero: s.numero })}
                        className="text-muted-foreground hover:text-destructive"
                        disabled={enCours}
                        onClick={() => {
                          if (!window.confirm(t("Retirer le numéro {numero} du stock ? Motif : {motif}.", { numero: s.numero, motif: t(MOTIFS_RETRAIT[motif as keyof typeof MOTIFS_RETRAIT]) }))) return;
                          setEtat(null);
                          startTransition(async () => setEtat(await retirerSerieProduit(s.id, produitId, motif)));
                        }}
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t("Remettre le numéro {numero} en stock", { numero: s.numero })}
                        className="text-muted-foreground"
                        disabled={enCours}
                        onClick={() => {
                          setEtat(null);
                          startTransition(async () => setEtat(await remettreSerieProduit(s.id, produitId)));
                        }}
                      >
                        <RotateCcw className="size-4" aria-hidden />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
              {sansNumero > 0 ? (
                <div className="flex items-center justify-between px-3 py-2 text-sm text-muted-foreground">
                  <span>{t("Unités en stock sans numéro")}</span>
                  <span className="tabular-nums">{sansNumero}</span>
                </div>
              ) : null}
              {series.length === 0 && sansNumero === 0 ? <p className="px-3 py-4 text-center text-sm text-muted-foreground">{t("Aucun numéro de série pour le moment.")}</p> : null}
            </div>
            {series.some((s) => s.statut === "EN_STOCK") ? (
              <ChampSelect label={t("Motif en cas de retrait d'une unité")} name="motifRetrait" value={motif} onChange={(e) => setMotif(e.target.value)} className="w-72">
                {Object.entries(MOTIFS_RETRAIT).map(([cle, libelle]) => (
                  <option key={cle} value={cle}>
                    {t(libelle)}
                  </option>
                ))}
              </ChampSelect>
            ) : null}
            <p className="text-sm text-muted-foreground">{t("{n} numéro(s) en stock.", { n: enStock })}</p>

            <div className="flex flex-wrap items-end gap-2 rounded-lg border p-3">
              <div className="w-48">
                <Champ label={t("Garantie (mois)")} name="dureeGarantie" type="number" inputMode="numeric" min={1} max={120} value={garantie} onChange={(e) => setGarantie(e.target.value)} />
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={enCours}
                onClick={() => {
                  setEtat(null);
                  startTransition(async () => setEtat(await definirGarantieProduit(produitId, garantie.trim() === "" ? null : Number(garantie))));
                }}
              >
                {t("Enregistrer la garantie")}
              </Button>
              <p className="w-full text-xs text-muted-foreground">{t("Appliquée aux prochaines ventes : la fin de garantie de chaque unité vendue se calcule à partir du jour de la vente. Laissez vide pour ne pas suivre de garantie.")}</p>
            </div>
            <form
              className="flex flex-col gap-3 rounded-lg border p-3"
              aria-label={t("Ajouter des numéros de série")}
              onSubmit={(e) => {
                e.preventDefault();
                const form = e.currentTarget;
                const donnees = new FormData(form);
                setEtat(null);
                startTransition(async () => {
                  const r = await ajouterSeriesProduit(produitId, null, donnees);
                  setEtat(r);
                  if (r?.message) {
                    form.reset();
                    setSaisie("");
                  }
                });
              }}
            >
              <ChampZone label={t("Numéros de série (un par ligne, ou séparés par une virgule)")} name="numeros" rows={4} value={saisie} onChange={(e) => setSaisie(e.target.value)} />
              <p className="text-xs text-muted-foreground" aria-live="polite">
                {t("{n} numéro(s) lu(s).", { n: apercu.numeros.length })}
                {apercu.doublons.length > 0 ? ` ${t("{n} doublon(s) ignoré(s).", { n: apercu.doublons.length })}` : ""}
              </p>
              <ChampSelect label={t("D'où viennent-ils ?")} name="origine" defaultValue={sansNumero > 0 ? "STOCK" : "ENTREE"} className="w-80">
                <option value="STOCK">{t("Déjà en stock ({n} sans numéro)", { n: sansNumero })}</option>
                <option value="ENTREE">{t("Nouvelle entrée de marchandise")}</option>
              </ChampSelect>
              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={enCours || apercu.numeros.length === 0}>
                  {enCours ? <Spinner /> : <Plus data-icon="inline-start" aria-hidden />}
                  {t("Ajouter les numéros")}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={enCours}
                  onClick={() => {
                    if (!window.confirm(t("Désactiver le suivi par numéro de série ? Les numéros sont effacés, le stock ne change pas."))) return;
                    setEtat(null);
                    startTransition(async () => setEtat(await definirSuiviSerieProduit(produitId, false)));
                  }}
                >
                  {t("Désactiver le suivi par numéro de série")}
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
