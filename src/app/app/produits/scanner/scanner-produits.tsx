"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ChampScan } from "@/components/produits/champ-scan";
import { chercherProduitParCode } from "@/lib/actions/codes-barres";
import { formaterFCFA } from "@/lib/facturation/calcul";
import { useT } from "@/lib/i18n/contexte";
import type { ProduitTrouve } from "@/lib/produits/codes-barres";

type Lecture = { code: string; produit: ProduitTrouve | null; erreur: string | null };

/** Page « Scanner » : chaque lecture retrouve le produit (nom, stock, prix) et mène à sa fiche ; les dernières lectures restent listées. */
export function ScannerProduits() {
  const t = useT();
  const [lectures, setLectures] = useState<Lecture[]>([]);
  const lire = useCallback(
    async (code: string) => {
      const r = await chercherProduitParCode(code);
      setLectures((l) => [{ code, produit: r?.produit ?? null, erreur: r?.produit ? null : (r?.erreur ?? t("Aucun produit ne porte ce code.")) }, ...l].slice(0, 12));
    },
    [t]
  );

  return (
    <div className="flex flex-col gap-4">
      <ChampScan autoFocus onCode={lire} />
      {lectures.length > 0 ? (
        <Card className="p-0">
          <div className="flex flex-col divide-y divide-border">
            {lectures.map((l, i) =>
              l.produit ? (
                <Link key={`${l.code}-${i}`} href={`/app/produits/${l.produit.id}`} className="flex items-center justify-between gap-3 px-4 py-3 text-sm transition-colors hover:bg-muted/40">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{l.produit.nom}</p>
                    <p className="text-xs text-muted-foreground">
                      {l.code} · {formaterFCFA(l.produit.prixVente)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {l.produit.suiviStock ? <Badge variant={l.produit.stockActuel <= 0 ? "danger" : "info"}>{t("Stock : {n}", { n: l.produit.stockActuel })}</Badge> : null}
                    <ArrowRight className="size-4 text-muted-foreground" aria-hidden />
                  </div>
                </Link>
              ) : (
                <div key={`${l.code}-${i}`} className="px-4 py-3 text-sm">
                  <p className="font-medium">{l.code}</p>
                  <p className="text-xs text-destructive">{l.erreur}</p>
                </div>
              )
            )}
          </div>
        </Card>
      ) : null}
    </div>
  );
}
