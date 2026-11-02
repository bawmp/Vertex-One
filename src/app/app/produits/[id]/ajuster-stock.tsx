"use client";

import { useState, useTransition } from "react";
import { ClipboardCheck, PackageMinus, PackagePlus, Boxes, CircleCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Champ, ChampSelect } from "@/components/formulaire/champ";
import { ChoixCartes } from "@/components/formulaire/choix-cartes";
import { activerSuiviStockProduit, corrigerStockProduit, type EtatStock } from "@/lib/actions/produit";
import { MOTIFS_AJOUT, MOTIFS_RETRAIT } from "@/lib/produits/motifs-stock";
import { useT } from "@/lib/i18n/contexte";

type Mode = "AJOUT" | "RETRAIT" | "INVENTAIRE";

function Resultat({ etat }: { etat: EtatStock }) {
  if (!etat) return null;
  if (etat.erreur) return <p role="alert" className="text-sm text-destructive">{etat.erreur}</p>;
  return (
    <p role="status" className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
      <CircleCheck className="size-4" aria-hidden />
      {etat.message}
    </p>
  );
}

/**
 * Fiche produit, onglet Stock : deux gestes simples. Un produit dont le stock n'est pas suivi propose d'activer le suivi (une
 * seule question : « combien en avez-vous ? »). Sinon trois grandes cartes — j'en ai reçu, j'en ai perdu, j'ai compté — puis la
 * quantité, la raison, et un aperçu du stock obtenu avant d'enregistrer. Les contrôles sont refaits côté serveur.
 */
export type DepotChoix = { id: string; nom: string; principal: boolean; quantite: number };

export function AjusterStock({ produitId, suiviStock, stockActuel, depots = [] }: { produitId: string; suiviStock: boolean; stockActuel: number; depots?: DepotChoix[] }) {
  const t = useT();
  const [enCours, startTransition] = useTransition();
  const [etat, setEtat] = useState<EtatStock>(null);
  const [mode, setMode] = useState<Mode>("AJOUT");
  const [quantite, setQuantite] = useState("");
  const [cle, setCle] = useState(0);
  const plusieursDepots = depots.length > 1;
  const [depotId, setDepotId] = useState(() => depots.find((d) => d.principal)?.id ?? depots[0]?.id ?? "");
  // Avec plusieurs dépôts, l'aperçu part de ce que contient le dépôt choisi, pas du total.
  const base = plusieursDepots ? (depots.find((d) => d.id === depotId)?.quantite ?? 0) : stockActuel;

  const nombre = quantite.trim() === "" ? null : Number(quantite);
  const apercu = nombre === null || !Number.isFinite(nombre) ? null : mode === "AJOUT" ? base + nombre : mode === "RETRAIT" ? base - nombre : nombre;

  function envoyer(e: React.FormEvent<HTMLFormElement>, action: (id: string, etat: EtatStock, donnees: FormData) => Promise<EtatStock>) {
    e.preventDefault();
    const donnees = new FormData(e.currentTarget);
    setEtat(null);
    startTransition(async () => {
      const resultat = await action(produitId, null, donnees);
      setEtat(resultat);
      if (resultat && !resultat.erreur) {
        setQuantite("");
        setCle((k) => k + 1);
      }
    });
  }

  if (!suiviStock) {
    return (
      <Card>
        <CardContent>
          <form onSubmit={(e) => envoyer(e, activerSuiviStockProduit)} className="flex flex-col gap-4">
            <div className="flex items-start gap-3">
              <Boxes className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
              <div>
                <h2 className="text-sm font-medium">{t("Le stock de ce produit n'est pas suivi")}</h2>
                <p className="text-sm text-muted-foreground">{t("Activez le suivi : chaque vente et chaque achat mettra le stock à jour tout seul, et vous verrez l'historique.")}</p>
              </div>
            </div>
            <Champ label={t("Combien en avez-vous en ce moment ?")} name="quantite" type="number" min={0} step={1} defaultValue={0} required inputMode="numeric" />
            <Resultat etat={etat} />
            <Button type="submit" disabled={enCours} className="self-start">
              {enCours ? <Spinner /> : null}
              {t("Activer le suivi du stock")}
            </Button>
          </form>
        </CardContent>
      </Card>
    );
  }

  const motifs = mode === "AJOUT" ? MOTIFS_AJOUT : MOTIFS_RETRAIT;
  const libelleQuantite = mode === "AJOUT" ? t("Combien en avez-vous reçu ?") : mode === "RETRAIT" ? t("Combien en retirez-vous ?") : t("Combien y en a-t-il vraiment en rayon ?");

  return (
    <Card>
      <CardContent>
        <form key={cle} onSubmit={(e) => envoyer(e, corrigerStockProduit)} className="flex flex-col gap-4" aria-label={t("Ajuster le stock")}>
          <h2 className="text-sm font-medium">{t("Que voulez-vous faire ?")}</h2>
          <ChoixCartes
            nom="mode"
            etiquette={t("Que voulez-vous faire ?")}
            valeur={mode}
            onChange={(v) => setMode(v as Mode)}
            colonnes={3}
            options={[
              { valeur: "AJOUT", libelle: t("J'en ai reçu"), detail: t("Livraison, retour client, article retrouvé"), icone: PackagePlus },
              { valeur: "RETRAIT", libelle: t("J'en ai perdu"), detail: t("Casse, perte, vol, produit périmé"), icone: PackageMinus },
              { valeur: "INVENTAIRE", libelle: t("J'ai compté"), detail: t("Je saisis ce qu'il y a vraiment, l'écart se calcule"), icone: ClipboardCheck },
            ]}
          />

          {plusieursDepots ? (
            <ChampSelect label={t("Dépôt")} name="depotId" value={depotId} onChange={(e) => setDepotId(e.target.value)}>
              {depots.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nom} ({d.quantite})
                </option>
              ))}
            </ChampSelect>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <Champ label={libelleQuantite} name="quantite" type="number" min={mode === "INVENTAIRE" ? 0 : 1} step={1} required inputMode="numeric" value={quantite} onChange={(e) => setQuantite(e.target.value)} />
            {mode !== "INVENTAIRE" ? (
              <ChampSelect label={t("Raison")} name="motif" required defaultValue="">
                <option value="" disabled>
                  {t("Choisir la raison")}
                </option>
                {Object.entries(motifs).map(([valeur, libelle]) => (
                  <option key={valeur} value={valeur}>
                    {t(libelle)}
                  </option>
                ))}
              </ChampSelect>
            ) : null}
          </div>
          <Champ label={t("Remarque (facultatif)")} name="note" maxLength={300} />

          <p className="text-sm text-muted-foreground" aria-live="polite">
            {plusieursDepots ? t("Dans ce dépôt : {n}", { n: base }) : t("Stock actuel : {n}", { n: stockActuel })}
            {apercu !== null ? <> → <span className={apercu < 0 ? "font-medium text-destructive" : "font-medium text-foreground"}>{t("après : {n}", { n: apercu })}</span></> : null}
          </p>

          <Resultat etat={etat} />
          <Button type="submit" disabled={enCours || quantite.trim() === ""} className="self-start">
            {enCours ? <Spinner /> : null}
            {enCours ? t("Enregistrement…") : t("Enregistrer")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
