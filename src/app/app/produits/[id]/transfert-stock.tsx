"use client";

import { useState, useTransition } from "react";
import { ArrowRightLeft, CircleCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Champ, ChampSelect } from "@/components/formulaire/champ";
import { transfererStockProduit, type EtatDepot } from "@/lib/actions/depot";
import { useT } from "@/lib/i18n/contexte";

/**
 * Transfert d'un produit entre deux dépôts : « de » (avec ce qu'il contient), « vers », quantité. Le stock total ne change pas.
 * Les contrôles (quantité disponible, dépôts différents et actifs) sont refaits côté serveur.
 */
export function TransfertStock({ produitId, depots }: { produitId: string; depots: { id: string; nom: string; quantite: number }[] }) {
  const t = useT();
  const [depuis, setDepuis] = useState(depots[0]?.id ?? "");
  const [vers, setVers] = useState(depots[1]?.id ?? "");
  const [etat, setEtat] = useState<EtatDepot>(null);
  const [cle, setCle] = useState(0);
  const [enCours, startTransition] = useTransition();
  const dispo = depots.find((d) => d.id === depuis)?.quantite ?? 0;

  function envoyer(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const donnees = new FormData(e.currentTarget);
    setEtat(null);
    startTransition(async () => {
      const resultat = await transfererStockProduit(produitId, null, donnees);
      setEtat(resultat);
      if (resultat?.message) setCle((k) => k + 1);
    });
  }

  return (
    <Card>
      <CardContent>
        <form key={cle} onSubmit={envoyer} className="flex flex-col gap-4" aria-label={t("Transférer entre dépôts")}>
          <div className="flex items-start gap-3">
            <ArrowRightLeft className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
            <div>
              <h2 className="text-sm font-medium">{t("Transférer entre dépôts")}</h2>
              <p className="text-sm text-muted-foreground">{t("Déplacez du stock d'un dépôt à un autre : le total de ce produit ne change pas.")}</p>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <ChampSelect label={t("Depuis")} name="depuis" value={depuis} onChange={(e) => setDepuis(e.target.value)}>
              {depots.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nom} ({d.quantite})
                </option>
              ))}
            </ChampSelect>
            <ChampSelect label={t("Vers")} name="vers" value={vers} onChange={(e) => setVers(e.target.value)}>
              {depots.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nom} ({d.quantite})
                </option>
              ))}
            </ChampSelect>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Champ label={t("Quantité à transférer")} name="quantite" type="number" min={1} max={Math.max(dispo, 1)} step={1} required inputMode="numeric" aide={t("Disponible : {n}", { n: dispo })} />
            <Champ label={t("Remarque (facultatif)")} name="note" maxLength={300} />
          </div>
          {depuis === vers ? <p className="text-sm text-muted-foreground">{t("Choisissez deux dépôts différents.")}</p> : null}
          {etat?.erreur ? <p role="alert" className="text-sm text-destructive">{etat.erreur}</p> : null}
          {etat?.message ? (
            <p role="status" className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
              <CircleCheck className="size-4" aria-hidden />
              {etat.message}
            </p>
          ) : null}
          <Button type="submit" disabled={enCours || depuis === vers} className="self-start">
            {enCours ? <Spinner /> : null}
            {t("Transférer")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
