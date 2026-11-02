"use client";

import { useState, useTransition } from "react";
import { CircleCheck, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Champ, ChampSelect } from "@/components/formulaire/champ";
import { definirReapprovisionnementProduit, type EtatReappro } from "@/lib/actions/reapprovisionnement";
import { useT } from "@/lib/i18n/contexte";

/** Fournisseur habituel et stock visé : de quoi pré-remplir la liste « À réapprovisionner ». Contrôles refaits côté serveur. */
export function ReapproProduit({ produitId, fournisseurId, stockCible, fournisseurs }: { produitId: string; fournisseurId: string | null; stockCible: number | null; fournisseurs: { id: string; nom: string }[] }) {
  const t = useT();
  const [enCours, startTransition] = useTransition();
  const [etat, setEtat] = useState<EtatReappro>(null);

  return (
    <Card>
      <CardContent>
        <form
          className="flex flex-col gap-3"
          aria-label={t("Réapprovisionnement")}
          onSubmit={(e) => {
            e.preventDefault();
            const donnees = new FormData(e.currentTarget);
            setEtat(null);
            startTransition(async () => setEtat(await definirReapprovisionnementProduit(produitId, null, donnees)));
          }}
        >
          <div className="flex items-start gap-3">
            <ShoppingCart className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
            <div>
              <h2 className="text-sm font-medium">{t("Réapprovisionnement")}</h2>
              <p className="text-sm text-muted-foreground">{t("Chez qui vous commandez ce produit, et le stock que vous voulez retrouver après une commande. Sans stock visé, c'est le double du seuil d'alerte.")}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-start gap-3">
            <ChampSelect label={t("Fournisseur habituel")} name="fournisseurId" defaultValue={fournisseurId ?? ""} className="w-72">
              <option value="">{t("Aucun")}</option>
              {fournisseurs.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nom}
                </option>
              ))}
            </ChampSelect>
            <Champ label={t("Stock visé")} name="stockCible" type="number" min={0} step={1} inputMode="numeric" defaultValue={stockCible ?? ""} className="w-48" />
            <Button type="submit" disabled={enCours} className="mt-1">
              {enCours ? <Spinner /> : null}
              {t("Enregistrer")}
            </Button>
          </div>
          {etat?.erreur ? <p role="alert" className="text-sm text-destructive">{etat.erreur}</p> : null}
          {etat?.message ? (
            <p role="status" className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
              <CircleCheck className="size-4" aria-hidden />
              {etat.message}
            </p>
          ) : null}
        </form>
      </CardContent>
    </Card>
  );
}
