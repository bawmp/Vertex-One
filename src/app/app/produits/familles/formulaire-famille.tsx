"use client";

import { useActionState, useMemo, useState } from "react";
import { Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Champ } from "@/components/formulaire/champ";
import { ajouterVariantesAction, creerFamilleAction } from "@/lib/actions/variantes";
import { combinerOptions, lireValeurs, nomVariante } from "@/lib/produits/variantes-regles";
import { useT } from "@/lib/i18n/contexte";

/**
 * Créer des variantes : on nomme jusqu'à trois options (Taille, Couleur…) avec leurs valeurs séparées par des virgules, et l'aperçu liste
 * aussitôt les produits qui seront créés. Sans `familleId`, crée aussi la famille ; avec, ajoute des variantes à une famille existante.
 * Contrôles refaits côté serveur.
 */
export function FormulaireFamille({ familleId, nomFamille }: { familleId?: string; nomFamille?: string }) {
  const t = useT();
  const action = familleId ? ajouterVariantesAction.bind(null, familleId) : creerFamilleAction;
  const [etat, formAction, enCours] = useActionState(action, null);
  const [nom, setNom] = useState(nomFamille ?? "");
  const [options, setOptions] = useState([
    { nom: t("Taille"), valeurs: "" },
    { nom: t("Couleur"), valeurs: "" },
    { nom: "", valeurs: "" },
  ]);

  const apercu = useMemo(() => combinerOptions(options.map((o) => ({ nom: o.nom, valeurs: lireValeurs(o.valeurs) }))), [options]);
  const maj = (i: number, champ: "nom" | "valeurs", valeur: string) => setOptions((o) => o.map((x, j) => (j === i ? { ...x, [champ]: valeur } : x)));

  return (
    <Card>
      <CardContent>
        <form action={formAction} className="flex flex-col gap-4" aria-label={t("Créer des variantes")}>
          <div className="flex items-start gap-3">
            <Layers className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
            <p className="text-sm text-muted-foreground">{t("Un produit par combinaison, chacun avec son propre stock. Séparez les valeurs par des virgules : S, M, L.")}</p>
          </div>

          {familleId ? null : <Champ label={t("Nom du modèle")} name="nom" required minLength={2} maxLength={80} placeholder={t("Ex. Tee-shirt col rond")} value={nom} onChange={(e) => setNom(e.target.value)} />}

          <div className="flex flex-col gap-3">
            {options.map((o, i) => (
              <div key={i} className="grid grid-cols-1 gap-3 sm:grid-cols-[12rem_1fr]">
                <Champ label={t("Option {n}", { n: i + 1 })} name={`option${i + 1}`} value={o.nom} onChange={(e) => maj(i, "nom", e.target.value)} maxLength={30} />
                <Champ label={t("Valeurs")} name={`valeurs${i + 1}`} value={o.valeurs} onChange={(e) => maj(i, "valeurs", e.target.value)} placeholder={i === 0 ? "S, M, L" : i === 1 ? t("Rouge, Bleu") : ""} />
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Champ label={t("Prix de vente (FCFA)")} name="prixVente" type="number" min={0} step={1} inputMode="numeric" defaultValue={0} />
            <Champ label={t("Prix d'achat (FCFA)")} name="prixAchat" type="number" min={0} step={1} inputMode="numeric" defaultValue={0} />
            <Champ label={t("Stock de départ de chaque variante")} name="stockInitial" type="number" min={0} step={1} inputMode="numeric" defaultValue={0} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="suiviStock" defaultChecked className="size-4 accent-primary" />
            {t("Suivre le stock de chaque variante")}
          </label>

          <div className="rounded-lg border bg-muted/30 p-3 text-sm" aria-live="polite">
            {apercu.ok ? (
              <>
                <p className="mb-1 font-medium">{t("{n} variante(s) seront créées :", { n: apercu.libelles.length })}</p>
                <ul className="flex max-h-40 flex-col gap-0.5 overflow-auto text-muted-foreground">
                  {apercu.libelles.slice(0, 30).map((l) => (
                    <li key={l}>{nomVariante(nomFamille ?? (nom || t("Modèle")), l)}</li>
                  ))}
                  {apercu.libelles.length > 30 ? <li>…</li> : null}
                </ul>
              </>
            ) : (
              <p className="text-muted-foreground">{t(apercu.erreur)}</p>
            )}
          </div>

          {etat?.erreur ? <p role="alert" className="text-sm text-destructive">{etat.erreur}</p> : null}
          {etat?.message ? <p role="status" className="text-sm text-emerald-700 dark:text-emerald-400">{etat.message}</p> : null}
          <Button type="submit" disabled={enCours || !apercu.ok || (!familleId && nom.trim().length < 2)} className="self-start">
            {enCours ? <Spinner /> : null}
            {apercu.ok ? t("Créer les {n} variantes", { n: apercu.libelles.length }) : t("Créer les variantes")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
