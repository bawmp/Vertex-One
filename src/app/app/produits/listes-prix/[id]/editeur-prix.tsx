"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { definirPrixFixeAction, supprimerListePrixAction } from "@/lib/actions/listes-prix";
import { prixPourListe } from "@/lib/produits/listes-prix-regles";
import { formaterFCFA } from "@/lib/facturation/calcul";
import { useT } from "@/lib/i18n/contexte";

type Ligne = { id: string; nom: string; prixVente: number; prixFixe: number | null };

/**
 * Prix de chaque produit dans la liste : un champ vide = la remise de la liste s'applique ; un prix saisi = prix fixe, qui l'emporte. Le prix
 * appliqué se met à jour sous les yeux, l'enregistrement se fait en quittant le champ.
 */
export function EditeurPrix({ listeId, remisePourcent, lignes, peutModifier }: { listeId: string; remisePourcent: number; lignes: Ligne[]; peutModifier: boolean }) {
  const t = useT();
  const [saisies, setSaisies] = useState<Record<string, string>>(() => Object.fromEntries(lignes.map((l) => [l.id, l.prixFixe === null ? "" : String(l.prixFixe)])));
  const [enCours, demarrer] = useTransition();
  const [etat, setEtat] = useState<{ texte: string; erreur: boolean } | null>(null);

  function enregistrer(l: Ligne) {
    const brut = (saisies[l.id] ?? "").trim();
    const valeur = brut === "" ? null : Number(brut);
    if ((valeur === null && l.prixFixe === null) || valeur === l.prixFixe) return;
    setEtat(null);
    demarrer(async () => {
      const r = await definirPrixFixeAction(listeId, l.id, valeur);
      setEtat(r?.erreur ? { texte: r.erreur, erreur: true } : { texte: t("Prix enregistré."), erreur: false });
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-hidden rounded-lg border">
        <div className="grid grid-cols-[1fr_auto_9rem_auto] items-center gap-x-4 border-b px-4 py-2 text-xs font-medium text-muted-foreground">
          <span>{t("Produit")}</span>
          <span className="text-right">{t("Catalogue")}</span>
          <span>{t("Prix fixe")}</span>
          <span className="text-right">{t("Prix appliqué")}</span>
        </div>
        <div className="flex flex-col divide-y divide-border">
          {lignes.map((l) => {
            const brut = (saisies[l.id] ?? "").trim();
            const fixe = brut === "" || Number.isNaN(Number(brut)) ? null : Number(brut);
            const applique = prixPourListe(l.prixVente, { remisePourcent }, fixe);
            return (
              <div key={l.id} className="grid grid-cols-[1fr_auto_9rem_auto] items-center gap-x-4 px-4 py-2 text-sm">
                <span className="truncate">{l.nom}</span>
                <span className="text-right tabular-nums text-muted-foreground">{formaterFCFA(l.prixVente)}</span>
                {peutModifier ? (
                  <Input type="number" min={0} step={1} inputMode="numeric" value={saisies[l.id] ?? ""} placeholder={t("Remise de la liste")} aria-label={t("Prix fixe de {nom}", { nom: l.nom })} onChange={(e) => setSaisies((s) => ({ ...s, [l.id]: e.target.value }))} onBlur={() => enregistrer(l)} className="h-8" />
                ) : (
                  <span className="text-muted-foreground">{l.prixFixe === null ? "—" : formaterFCFA(l.prixFixe)}</span>
                )}
                <span className={`text-right font-medium tabular-nums ${fixe !== null ? "text-primary" : ""}`}>{formaterFCFA(applique)}</span>
              </div>
            );
          })}
          {lignes.length === 0 ? <p className="px-4 py-6 text-center text-sm text-muted-foreground">{t("Aucun produit dans le catalogue.")}</p> : null}
        </div>
      </div>
      {enCours ? <Spinner /> : null}
      {etat ? <p role={etat.erreur ? "alert" : "status"} className={`text-sm ${etat.erreur ? "text-destructive" : "text-emerald-700 dark:text-emerald-400"}`}>{etat.texte}</p> : null}
    </div>
  );
}

export function BoutonSupprimerListe({ listeId, clients }: { listeId: string; clients: number }) {
  const t = useT();
  const [enCours, demarrer] = useTransition();
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={enCours}
      className="text-destructive hover:text-destructive"
      onClick={() => {
        const question = clients > 0 ? t("Supprimer cette liste ? {n} client(s) retrouveront les prix du catalogue.", { n: clients }) : t("Supprimer cette liste ?");
        if (window.confirm(question)) demarrer(async () => void (await supprimerListePrixAction(listeId)));
      }}
    >
      {enCours ? <Spinner /> : <Trash2 data-icon="inline-start" aria-hidden />}
      {t("Supprimer la liste")}
    </Button>
  );
}
