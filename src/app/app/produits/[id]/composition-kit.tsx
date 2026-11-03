"use client";

import { useState, useTransition } from "react";
import { CircleCheck, Package2, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Champ, ChampSelect } from "@/components/formulaire/champ";
import { ajouterComposantKit, retirerComposantKit, type EtatKit } from "@/lib/actions/kits";
import { formaterFCFA } from "@/lib/facturation/calcul";
import { useT } from "@/lib/i18n/contexte";

export type ComposantClient = { produitId: string; nom: string; quantite: number; stockActuel: number; unite: string | null };

/** Composition d'un kit : ses produits et leurs quantités, combien de kits le stock permet de vendre, coût de revient et marge. */
export function CompositionKit({ kitId, composants, disponibles, cout, prixVente, candidats, peutModifier }: { kitId: string; composants: ComposantClient[]; disponibles: number; cout: number; prixVente: number; candidats: { id: string; nom: string }[]; peutModifier: boolean }) {
  const t = useT();
  const [etat, setEtat] = useState<EtatKit>(null);
  const [enCours, startTransition] = useTransition();
  const [choix, setChoix] = useState("");
  const [quantite, setQuantite] = useState("1");
  const deja = new Set(composants.map((c) => c.produitId));
  const marge = prixVente - cout;

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <Package2 className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
          <div className="flex-1">
            <h2 className="text-sm font-medium">{t("Composition du kit")}</h2>
            <p className="text-sm text-muted-foreground">{t("Un kit n'a pas de stock à lui : sa vente sort le stock de chacun de ces produits.")}</p>
          </div>
          <Badge variant={disponibles > 0 ? "info" : "danger"}>{t("{n} kit(s) vendable(s)", { n: disponibles })}</Badge>
        </div>

        <div className="flex flex-col divide-y divide-border rounded-lg border text-sm">
          {composants.map((c) => (
            <div key={c.produitId} className="flex items-center justify-between gap-3 px-3 py-2">
              <span className="min-w-0 truncate">
                <strong>{c.quantite}</strong> × {c.nom}
              </span>
              <span className="flex shrink-0 items-center gap-2 text-muted-foreground">
                <span className="tabular-nums">{t("en stock : {n}", { n: c.stockActuel })}</span>
                {peutModifier ? (
                  <Button type="button" variant="ghost" size="icon-sm" disabled={enCours || composants.length <= 1} aria-label={t("Retirer {nom} du kit", { nom: c.nom })} className="hover:text-destructive" onClick={() => { setEtat(null); startTransition(async () => setEtat(await retirerComposantKit(kitId, c.produitId))); }}>
                    <Trash2 className="size-4" aria-hidden />
                  </Button>
                ) : null}
              </span>
            </div>
          ))}
        </div>

        <p className="text-sm">
          {t("Coût de revient : {cout}", { cout: formaterFCFA(cout) })} · <span className={marge < 0 ? "font-medium text-destructive" : "font-medium"}>{t("Marge : {marge}", { marge: formaterFCFA(marge) })}</span>
        </p>

        {peutModifier ? (
          <form
            className="flex flex-wrap items-end gap-3"
            aria-label={t("Ajouter un produit au kit")}
            onSubmit={(e) => {
              e.preventDefault();
              setEtat(null);
              startTransition(async () => {
                const r = await ajouterComposantKit(kitId, choix, Number(quantite));
                setEtat(r);
                if (r?.message) {
                  setChoix("");
                  setQuantite("1");
                }
              });
            }}
          >
            <ChampSelect label={t("Produit à ajouter")} name="composant" value={choix} onChange={(e) => setChoix(e.target.value)} className="w-64">
              <option value="" />
              {candidats.filter((c) => !deja.has(c.id)).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nom}
                </option>
              ))}
            </ChampSelect>
            <Champ label={t("Quantité")} name="quantite" type="number" min={1} step={1} inputMode="numeric" value={quantite} onChange={(e) => setQuantite(e.target.value)} className="w-32" />
            <Button type="submit" variant="outline" disabled={enCours || !choix}>
              {enCours ? <Spinner /> : <Plus data-icon="inline-start" aria-hidden />}
              {t("Ajouter au kit")}
            </Button>
          </form>
        ) : null}

        {etat?.erreur ? <p role="alert" className="text-sm text-destructive">{etat.erreur}</p> : null}
        {etat?.message ? (
          <p role="status" className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
            <CircleCheck className="size-4" aria-hidden />
            {etat.message}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
