"use client";

import { useActionState, useMemo, useState } from "react";
import { Package2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Champ, ChampSelect } from "@/components/formulaire/champ";
import { creerKitAction } from "@/lib/actions/kits";
import { coutDuKit, kitsDisponibles } from "@/lib/produits/kits-regles";
import { formaterFCFA } from "@/lib/facturation/calcul";
import { useT } from "@/lib/i18n/contexte";

type Composable = { id: string; nom: string; stockActuel: number; coutMoyen: number; unite: string | null };
type Ligne = { produitId: string; quantite: string };

/**
 * Créer un kit : un nom, un prix, et les produits qui le composent avec leur quantité. L'aperçu montre le coût de revient, la marge et
 * combien de kits le stock actuel permet de vendre. Contrôles refaits côté serveur.
 */
export function FormulaireKit({ produits }: { produits: Composable[] }) {
  const t = useT();
  const [etat, action, enCours] = useActionState(creerKitAction, null);
  const [prix, setPrix] = useState("");
  const [lignes, setLignes] = useState<Ligne[]>([{ produitId: "", quantite: "1" }, { produitId: "", quantite: "1" }]);
  const maj = (i: number, champ: keyof Ligne, valeur: string) => setLignes((l) => l.map((x, j) => (j === i ? { ...x, [champ]: valeur } : x)));

  const choisies = useMemo(
    () =>
      lignes
        .map((l) => ({ p: produits.find((x) => x.id === l.produitId), quantite: Math.floor(Number(l.quantite)) }))
        .filter((l): l is { p: Composable; quantite: number } => Boolean(l.p) && l.quantite >= 1),
    [lignes, produits]
  );
  const cout = coutDuKit(choisies.map((c) => ({ coutMoyen: c.p.coutMoyen, quantite: c.quantite })));
  const disponibles = kitsDisponibles(choisies.map((c) => ({ stockActuel: c.p.stockActuel, quantite: c.quantite })));
  const prixNombre = Number(prix);
  const marge = Number.isFinite(prixNombre) && prix !== "" ? prixNombre - cout : null;

  return (
    <Card>
      <CardContent>
        <form action={action} className="flex flex-col gap-4" aria-label={t("Créer un kit")}>
          <div className="flex items-start gap-3">
            <Package2 className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
            <p className="text-sm text-muted-foreground">{t("Un kit se vend comme un produit, mais n'a pas de stock à lui : sa vente sort le stock de chacun de ses composants.")}</p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_14rem]">
            <Champ label={t("Nom du kit")} name="nom" required minLength={2} maxLength={80} placeholder={t("Ex. Coffret cadeau")} />
            <Champ label={t("Prix de vente (FCFA)")} name="prixVente" type="number" min={0} step={1} inputMode="numeric" value={prix} onChange={(e) => setPrix(e.target.value)} required />
          </div>

          <div className="flex flex-col gap-2">
            <h2 className="text-sm font-medium">{t("Ce que contient un kit")}</h2>
            {lignes.map((l, i) => (
              <div key={i} className="grid grid-cols-[1fr_6rem_auto] items-end gap-2">
                <ChampSelect label={i === 0 ? t("Produit") : ""} name="composantId" value={l.produitId} onChange={(e) => maj(i, "produitId", e.target.value)}>
                  <option value="" />
                  {produits.map((p) => (
                    <option key={p.id} value={p.id} disabled={lignes.some((x, j) => j !== i && x.produitId === p.id)}>
                      {p.nom} ({p.stockActuel})
                    </option>
                  ))}
                </ChampSelect>
                <Champ label={i === 0 ? t("Quantité") : ""} name="quantite" type="number" min={1} step={1} inputMode="numeric" value={l.quantite} onChange={(e) => maj(i, "quantite", e.target.value)} />
                <Button type="button" variant="ghost" size="icon-sm" disabled={lignes.length <= 1} aria-label={t("Retirer cette ligne")} onClick={() => setLignes((x) => x.filter((_, j) => j !== i))}>
                  <X className="size-4" aria-hidden />
                </Button>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" className="self-start" disabled={lignes.length >= 20} onClick={() => setLignes((l) => [...l, { produitId: "", quantite: "1" }])}>
              <Plus data-icon="inline-start" aria-hidden />
              {t("Ajouter un produit")}
            </Button>
          </div>

          {choisies.length > 0 ? (
            <div className="rounded-lg border bg-muted/30 p-3 text-sm" aria-live="polite">
              <p>
                {t("Coût de revient : {cout}", { cout: formaterFCFA(cout) })}
                {marge !== null ? <> · <span className={marge < 0 ? "font-medium text-destructive" : "font-medium"}>{t("Marge : {marge}", { marge: formaterFCFA(marge) })}</span></> : null}
              </p>
              <p className="text-muted-foreground">{t("Avec le stock actuel, vous pouvez vendre {n} kit(s).", { n: disponibles })}</p>
            </div>
          ) : null}

          {produits.length === 0 ? <p className="text-sm text-muted-foreground">{t("Aucun produit suivi en stock : créez d'abord les produits qui composeront le kit.")}</p> : null}
          {etat?.erreur ? <p role="alert" className="text-sm text-destructive">{etat.erreur}</p> : null}
          <Button type="submit" disabled={enCours || choisies.length === 0} className="self-start">
            {enCours ? <Spinner /> : null}
            {t("Créer le kit")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
