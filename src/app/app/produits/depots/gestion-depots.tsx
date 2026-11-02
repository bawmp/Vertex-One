"use client";

import { useState, useTransition } from "react";
import { Archive, Check, CircleCheck, Pencil, Plus, Star, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Champ } from "@/components/formulaire/champ";
import { ajouterDepot, archiverDepotAction, choisirDepotPrincipal, renommerDepotAction, type EtatDepot } from "@/lib/actions/depot";
import { useT } from "@/lib/i18n/contexte";

export type LigneDepot = { id: string; nom: string; principal: boolean; nbProduits: number; nbArticles: number };

function Retour({ etat }: { etat: EtatDepot }) {
  if (!etat) return null;
  if (etat.erreur) return <p role="alert" className="text-sm text-destructive">{etat.erreur}</p>;
  return (
    <p role="status" className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
      <CircleCheck className="size-4" aria-hidden />
      {etat.message}
    </p>
  );
}

function LigneDuDepot({ depot, peutModifier, onRetour }: { depot: LigneDepot; peutModifier: boolean; onRetour: (e: EtatDepot) => void }) {
  const t = useT();
  const [renomme, setRenomme] = useState(false);
  const [enCours, startTransition] = useTransition();

  function lancer(action: () => Promise<EtatDepot>) {
    startTransition(async () => onRetour(await action()));
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
      {renomme ? (
        <form
          className="flex items-center gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            const donnees = new FormData(e.currentTarget);
            lancer(async () => {
              const r = await renommerDepotAction(depot.id, null, donnees);
              if (r?.message) setRenomme(false);
              return r;
            });
          }}
        >
          <Input name="nom" defaultValue={depot.nom} required minLength={2} maxLength={60} aria-label={t("Nouveau nom du dépôt")} className="h-8 w-56" autoFocus />
          <Button type="submit" size="icon-sm" disabled={enCours} aria-label={t("Enregistrer le nom")}>
            <Check className="size-4" aria-hidden />
          </Button>
          <Button type="button" size="icon-sm" variant="ghost" onClick={() => setRenomme(false)} aria-label={t("Annuler")}>
            <X className="size-4" aria-hidden />
          </Button>
        </form>
      ) : (
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-medium">
            {depot.nom}
            {depot.principal ? <Badge variant="brand">{t("Principal")}</Badge> : null}
          </p>
          <p className="text-xs text-muted-foreground">{t("{produits} produit(s), {articles} article(s) en stock", { produits: depot.nbProduits, articles: depot.nbArticles })}</p>
        </div>
      )}
      {peutModifier && !renomme ? (
        <div className="flex items-center gap-1">
          <Button type="button" variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-primary" onClick={() => setRenomme(true)} aria-label={t("Renommer {nom}", { nom: depot.nom })}>
            <Pencil className="size-4" aria-hidden />
          </Button>
          {!depot.principal ? (
            <>
              <Button type="button" variant="outline" size="sm" disabled={enCours} onClick={() => lancer(() => choisirDepotPrincipal(depot.id))}>
                <Star data-icon="inline-start" aria-hidden />
                {t("Définir comme principal")}
              </Button>
              <Button type="button" variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-destructive" disabled={enCours} onClick={() => lancer(() => archiverDepotAction(depot.id))} aria-label={t("Archiver {nom}", { nom: depot.nom })}>
                <Archive className="size-4" aria-hidden />
              </Button>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** Liste des dépôts et ajout d'un nouveau : un champ, un bouton. Renommer, changer de dépôt principal et archiver se font sur la ligne. */
export function GestionDepots({ depots, peutModifier }: { depots: LigneDepot[]; peutModifier: boolean }) {
  const t = useT();
  const [retour, setRetour] = useState<EtatDepot>(null);
  const [cle, setCle] = useState(0);
  const [enCours, startTransition] = useTransition();

  function ajouter(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const donnees = new FormData(e.currentTarget);
    setRetour(null);
    startTransition(async () => {
      const r = await ajouterDepot(null, donnees);
      setRetour(r);
      if (r?.message) setCle((k) => k + 1);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-0">
        <div className="flex flex-col divide-y divide-border">
          {depots.map((d) => (
            <LigneDuDepot key={d.id} depot={d} peutModifier={peutModifier} onRetour={setRetour} />
          ))}
        </div>
      </Card>
      {peutModifier ? (
        <Card>
          <CardContent>
            <form key={cle} onSubmit={ajouter} className="flex flex-wrap items-start gap-3" aria-label={t("Ajouter un dépôt")}>
              <Champ label={t("Nom du nouveau dépôt")} name="nom" required minLength={2} maxLength={60} className="w-72" aide={t("Exemples : Boutique centre-ville, Entrepôt Bonabéri")} />
              <Button type="submit" disabled={enCours} className="mt-1">
                {enCours ? <Spinner /> : <Plus data-icon="inline-start" aria-hidden />}
                {t("Ajouter le dépôt")}
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : null}
      <Retour etat={retour} />
    </div>
  );
}
