"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CircleCheck, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { annulerInventaire, compterProduit, validerInventaire } from "@/lib/actions/inventaire-session";
import { formaterFCFA } from "@/lib/facturation/calcul";
import { ChampScan } from "@/components/produits/champ-scan";
import { normaliserCode } from "@/lib/produits/codes-barres-regles";
import { useT } from "@/lib/i18n/contexte";

export type LigneComptageClient = { produitId: string; nom: string; stockDepot: number; coutMoyen: number; codeBarres: string | null; comptee: number | null; theorique: number | null; comptePar: string | null };

/**
 * Écran de comptage : une ligne par produit, on tape la quantité comptée, elle s'enregistre en quittant la case (Entrée aussi). Les
 * autres personnes comptent en même temps sur leur appareil ; « Actualiser » affiche leurs comptages. Rien ne change dans le stock tant
 * que l'Administrateur n'a pas validé. Contrôles refaits côté serveur.
 */
export function Comptage({ sessionId, lignes, ouvert, peutCompter, peutValider, peutAbandonner }: { sessionId: string; lignes: LigneComptageClient[]; ouvert: boolean; peutCompter: boolean; peutValider: boolean; peutAbandonner: boolean }) {
  const t = useT();
  const router = useRouter();
  const [valeurs, setValeurs] = useState<Record<string, string>>(() => Object.fromEntries(lignes.map((l) => [l.produitId, l.comptee === null ? "" : String(l.comptee)])));
  const [etats, setEtats] = useState<Record<string, "ok" | "erreur" | "envoi">>({});
  const [message, setMessage] = useState<{ texte: string; erreur: boolean } | null>(null);
  const [confirmer, setConfirmer] = useState(false);
  const [recherche, setRecherche] = useState("");
  const [enCours, startTransition] = useTransition();

  // Un code lu (douchette ou caméra) amène directement sur la case du produit pour y taper la quantité.
  const surCode = useCallback(
    (lu: string) => {
      const code = normaliserCode(lu);
      const ligne = code ? lignes.find((l) => l.codeBarres === code) : undefined;
      if (!ligne) {
        setMessage({ texte: t("Aucun produit de cet inventaire ne porte ce code."), erreur: true });
        return;
      }
      setMessage(null);
      setRecherche("");
      setTimeout(() => {
        const champ = document.getElementById(`compte-${ligne.produitId}`) as HTMLInputElement | null;
        champ?.scrollIntoView({ block: "center" });
        champ?.focus();
        champ?.select();
      }, 50);
    },
    [lignes, t]
  );

  const visibles = useMemo(() => lignes.filter((l) => l.nom.toLowerCase().includes(recherche.trim().toLowerCase())), [lignes, recherche]);
  const comptes = lignes.filter((l) => valeurs[l.produitId] !== "").length;
  const ecartTotal = lignes.reduce((s, l) => (valeurs[l.produitId] === "" ? s : s + (Number(valeurs[l.produitId]) - (l.theorique ?? l.stockDepot)) * l.coutMoyen), 0);

  async function enregistrer(l: LigneComptageClient) {
    const texte = valeurs[l.produitId].trim();
    const quantite = texte === "" ? null : Number(texte);
    if (quantite === (l.comptee) || (quantite === null && l.comptee === null)) return;
    setEtats((e) => ({ ...e, [l.produitId]: "envoi" }));
    const r = await compterProduit(sessionId, l.produitId, quantite);
    setEtats((e) => ({ ...e, [l.produitId]: r?.erreur ? "erreur" : "ok" }));
    if (r?.erreur) setMessage({ texte: r.erreur, erreur: true });
    else l.comptee = quantite;
  }

  return (
    <div className="flex flex-col gap-4">
      {ouvert && peutCompter ? <ChampScan onCode={surCode} placeholder={t("Scanner un produit pour compter")} /> : null}

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input type="search" value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder={t("Chercher un produit")} className="h-10 w-full rounded-lg border border-input bg-background pr-3 pl-9" aria-label={t("Chercher un produit")} />
        </div>
        <Button type="button" variant="outline" onClick={() => router.refresh()}>
          <RefreshCw data-icon="inline-start" aria-hidden />
          {t("Actualiser")}
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">
        {t("{n} produit(s) compté(s) sur {total}.", { n: comptes, total: lignes.length })} {comptes > 0 ? t("Écart de valeur : {valeur}.", { valeur: formaterFCFA(ecartTotal) }) : ""}
      </p>

      <Card className="p-0">
        <div className="grid grid-cols-[1fr_5rem_7rem_5rem] items-center gap-x-3 border-b px-4 py-2 text-xs font-medium text-muted-foreground">
          <span>{t("Produit")}</span>
          <span className="text-right">{t("Système")}</span>
          <span className="text-right">{t("Compté")}</span>
          <span className="text-right">{t("Écart")}</span>
        </div>
        <div className="flex flex-col divide-y divide-border">
          {visibles.map((l) => {
            const brut = valeurs[l.produitId];
            const compte = brut === "" ? null : Number(brut);
            const ecart = compte === null ? null : compte - (l.theorique ?? l.stockDepot);
            const etat = etats[l.produitId];
            return (
              <div key={l.produitId} className="grid grid-cols-[1fr_5rem_7rem_5rem] items-center gap-x-3 px-4 py-2 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">{l.nom}</p>
                  {l.comptePar ? <p className="text-xs text-muted-foreground">{t("compté par {nom}", { nom: l.comptePar })}</p> : null}
                </div>
                <span className="text-right tabular-nums text-muted-foreground">{l.stockDepot}</span>
                {ouvert && peutCompter ? (
                  <input
                    id={`compte-${l.produitId}`}
                    type="number"
                    min={0}
                    step={1}
                    inputMode="numeric"
                    value={brut}
                    onChange={(e) => setValeurs((v) => ({ ...v, [l.produitId]: e.target.value }))}
                    onBlur={() => enregistrer(l)}
                    onKeyDown={(e) => e.key === "Enter" && (e.currentTarget.blur(), e.preventDefault())}
                    aria-label={t("Quantité comptée pour {nom}", { nom: l.nom })}
                    className={`h-9 w-full rounded-lg border bg-background px-2 text-right tabular-nums ${etat === "erreur" ? "border-destructive" : "border-input"}`}
                  />
                ) : (
                  <span className="text-right tabular-nums">{compte ?? "—"}</span>
                )}
                <span className={`flex items-center justify-end gap-1 text-right tabular-nums ${ecart ? (ecart < 0 ? "text-destructive" : "text-emerald-700 dark:text-emerald-400") : "text-muted-foreground"}`}>
                  {etat === "envoi" ? <Spinner /> : etat === "ok" ? <CircleCheck className="size-3.5" aria-hidden /> : null}
                  {ecart === null ? "" : ecart > 0 ? `+${ecart}` : ecart}
                </span>
              </div>
            );
          })}
          {visibles.length === 0 ? <p className="px-4 py-8 text-center text-muted-foreground">{t("Aucun produit.")}</p> : null}
        </div>
      </Card>

      {message ? <p role={message.erreur ? "alert" : "status"} className={`text-sm ${message.erreur ? "text-destructive" : "text-emerald-700 dark:text-emerald-400"}`}>{message.texte}</p> : null}

      {ouvert && (peutValider || peutAbandonner) ? (
        <div className="flex flex-col gap-3 rounded-lg border p-3">
          {confirmer ? (
            <>
              <p className="text-sm">{t("Valider corrige le stock de chaque produit compté selon l'écart constaté. Les produits non comptés ne changent pas. Cette action est définitive.")}</p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  disabled={enCours || comptes === 0}
                  onClick={() =>
                    startTransition(async () => {
                      const r = await validerInventaire(sessionId);
                      setMessage({ texte: r?.erreur ?? r?.message ?? "", erreur: Boolean(r?.erreur) });
                      setConfirmer(false);
                      if (!r?.erreur) router.refresh();
                    })
                  }
                >
                  {enCours ? <Spinner /> : null}
                  {t("Oui, valider l'inventaire")}
                </Button>
                <Button type="button" variant="ghost" onClick={() => setConfirmer(false)}>
                  {t("Annuler")}
                </Button>
              </div>
            </>
          ) : (
            <div className="flex flex-wrap gap-2">
              {peutValider ? (
                <Button type="button" disabled={comptes === 0} onClick={() => setConfirmer(true)}>
                  {t("Valider l'inventaire")}
                </Button>
              ) : null}
              {peutAbandonner ? (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={enCours}
                  onClick={() =>
                    startTransition(async () => {
                      if (!window.confirm(t("Abandonner cet inventaire ? Le stock ne bougera pas."))) return;
                      const r = await annulerInventaire(sessionId);
                      setMessage({ texte: r?.erreur ?? r?.message ?? "", erreur: Boolean(r?.erreur) });
                      if (!r?.erreur) router.refresh();
                    })
                  }
                >
                  {t("Abandonner")}
                </Button>
              ) : null}
            </div>
          )}
          {!peutValider ? <p className="text-xs text-muted-foreground">{t("Seul l'Administrateur peut valider : prévenez-le quand le comptage est terminé.")}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
