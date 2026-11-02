"use client";

import { useState, useTransition } from "react";
import { CircleCheck, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { enregistrerInventaire, type EtatStock } from "@/lib/actions/produit";
import { useT } from "@/lib/i18n/contexte";

export type LigneInventaire = { id: string; nom: string; stockActuel: number };

/**
 * Inventaire physique : une ligne par produit suivi, on tape ce qu'on a compté. L'écart avec le stock du système apparaît tout de
 * suite (vert si en plus, rouge si en moins) ; seules les lignes remplies sont enregistrées, chacune dans l'historique du produit.
 */
export function FormulaireInventaire({ lignes }: { lignes: LigneInventaire[] }) {
  const t = useT();
  const [comptes, setComptes] = useState<Record<string, string>>({});
  const [recherche, setRecherche] = useState("");
  const [etat, setEtat] = useState<EtatStock>(null);
  const [enCours, startTransition] = useTransition();

  const visibles = lignes.filter((l) => l.nom.toLowerCase().includes(recherche.trim().toLowerCase()));
  const remplies = Object.values(comptes).filter((v) => v.trim() !== "").length;

  function enregistrer(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const donnees = new FormData();
    for (const [id, valeur] of Object.entries(comptes)) if (valeur.trim() !== "") donnees.set(`compte_${id}`, valeur);
    setEtat(null);
    startTransition(async () => {
      const resultat = await enregistrerInventaire(null, donnees);
      setEtat(resultat);
      if (resultat && !resultat.erreur) setComptes({});
    });
  }

  return (
    <form onSubmit={enregistrer} className="flex flex-col gap-4" aria-label={t("Inventaire")}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder={t("Chercher un produit")} aria-label={t("Chercher un produit")} className="pl-9" />
      </div>

      <Card className="p-0">
        <div className="grid grid-cols-[1fr_auto_7rem_auto] items-center gap-x-3 border-b px-4 py-2 text-xs font-medium text-muted-foreground">
          <span>{t("Produit")}</span>
          <span className="text-right">{t("Dans le système")}</span>
          <span>{t("Compté")}</span>
          <span className="w-12 text-right">{t("Écart")}</span>
        </div>
        <div className="flex flex-col divide-y divide-border">
          {visibles.map((l) => {
            const saisie = comptes[l.id] ?? "";
            const compte = saisie.trim() === "" ? null : Number(saisie);
            const ecart = compte === null || !Number.isFinite(compte) ? null : compte - l.stockActuel;
            return (
              <div key={l.id} className="grid grid-cols-[1fr_auto_7rem_auto] items-center gap-x-3 px-4 py-2 text-sm">
                <span className="truncate font-medium">{l.nom}</span>
                <span className="text-right tabular-nums text-muted-foreground">{l.stockActuel}</span>
                <Input
                  type="number"
                  min={0}
                  step={1}
                  inputMode="numeric"
                  value={saisie}
                  onChange={(e) => setComptes((c) => ({ ...c, [l.id]: e.target.value }))}
                  aria-label={t("Quantité comptée pour {nom}", { nom: l.nom })}
                />
                <span className={"w-12 text-right tabular-nums " + (ecart === null || ecart === 0 ? "text-muted-foreground" : ecart > 0 ? "font-medium text-emerald-700 dark:text-emerald-400" : "font-medium text-destructive")}>
                  {ecart === null ? "" : ecart > 0 ? `+${ecart}` : ecart}
                </span>
              </div>
            );
          })}
          {visibles.length === 0 ? <p className="px-4 py-6 text-center text-sm text-muted-foreground">{t("Aucun produit ne correspond.")}</p> : null}
        </div>
      </Card>

      {etat?.erreur ? <p role="alert" className="text-sm text-destructive">{etat.erreur}</p> : null}
      {etat?.message ? (
        <p role="status" className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
          <CircleCheck className="size-4" aria-hidden />
          {etat.message}
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={enCours || remplies === 0}>
          {enCours ? <Spinner /> : null}
          {enCours ? t("Enregistrement…") : t("Enregistrer l'inventaire")}
        </Button>
        <span className="text-sm text-muted-foreground">{remplies === 0 ? t("Tapez les quantités comptées, seules les lignes remplies sont enregistrées.") : t("{n} ligne(s) à enregistrer", { n: remplies })}</span>
      </div>
    </form>
  );
}
