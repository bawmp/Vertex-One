"use client";

import { useState, useTransition } from "react";
import { CircleCheck, Ruler, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Champ } from "@/components/formulaire/champ";
import { ajouterConditionnementProduit, definirUniteProduit, retirerConditionnementProduit, type EtatVariantes } from "@/lib/actions/variantes";
import { useT } from "@/lib/i18n/contexte";

export type ConditionnementClient = { id: string; nom: string; quantiteBase: number };

/**
 * Unité de base et conditionnements d'un produit (« carton = 12 pièces »). Le stock reste compté en unités de base ; les conditionnements
 * servent à saisir (j'en ai reçu 3 cartons) et à lire (« 2 cartons et 3 pièces »). Contrôles refaits côté serveur.
 */
export function UnitesProduit({ produitId, unite, conditionnements }: { produitId: string; unite: string | null; conditionnements: ConditionnementClient[] }) {
  const t = useT();
  const [etat, setEtat] = useState<EtatVariantes>(null);
  const [enCours, startTransition] = useTransition();
  const [uniteSaisie, setUniteSaisie] = useState(unite ?? "");
  const [nom, setNom] = useState("");
  const [quantite, setQuantite] = useState("");
  const base = unite ?? t("unité");

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <Ruler className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
          <div>
            <h2 className="text-sm font-medium">{t("Unité et conditionnements")}</h2>
            <p className="text-sm text-muted-foreground">{t("Le stock est compté dans l'unité de base. Ajoutez un conditionnement (carton, caisse…) pour saisir et lire le stock en cartons.")}</p>
          </div>
        </div>

        <form
          className="flex flex-wrap items-start gap-3"
          aria-label={t("Unité de base")}
          onSubmit={(e) => {
            e.preventDefault();
            setEtat(null);
            startTransition(async () => setEtat(await definirUniteProduit(produitId, uniteSaisie)));
          }}
        >
          <Champ label={t("Unité de base")} name="unite" value={uniteSaisie} onChange={(e) => setUniteSaisie(e.target.value)} maxLength={20} placeholder={t("pièce, kg, litre…")} className="w-56" />
          <Button type="submit" variant="outline" disabled={enCours} className="mt-1">
            {t("Enregistrer l'unité")}
          </Button>
        </form>

        {conditionnements.length > 0 ? (
          <div className="flex flex-col divide-y divide-border rounded-lg border">
            {conditionnements.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                <span>
                  <strong>{c.nom}</strong> = {c.quantiteBase} {base}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("Retirer le conditionnement {nom}", { nom: c.nom })}
                  className="text-muted-foreground hover:text-destructive"
                  disabled={enCours}
                  onClick={() => {
                    setEtat(null);
                    startTransition(async () => setEtat(await retirerConditionnementProduit(c.id, produitId)));
                  }}
                >
                  <Trash2 className="size-4" aria-hidden />
                </Button>
              </div>
            ))}
          </div>
        ) : null}

        <form
          className="flex flex-wrap items-start gap-3"
          aria-label={t("Ajouter un conditionnement")}
          onSubmit={(e) => {
            e.preventDefault();
            setEtat(null);
            startTransition(async () => {
              const r = await ajouterConditionnementProduit(produitId, nom, Number(quantite));
              setEtat(r);
              if (r?.message) {
                setNom("");
                setQuantite("");
              }
            });
          }}
        >
          <Champ label={t("Nom du conditionnement")} name="nom" value={nom} onChange={(e) => setNom(e.target.value)} maxLength={30} placeholder={t("Carton")} className="w-52" required />
          <Champ label={t("Contient (en {unite})", { unite: base })} name="quantiteBase" type="number" min={2} step={1} inputMode="numeric" value={quantite} onChange={(e) => setQuantite(e.target.value)} className="w-52" required />
          <Button type="submit" disabled={enCours} className="mt-1">
            {enCours ? <Spinner /> : null}
            {t("Ajouter le conditionnement")}
          </Button>
        </form>

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
