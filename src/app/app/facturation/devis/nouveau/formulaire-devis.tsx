"use client";

import { useActionState, useState } from "react";
import { CalendarClock, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Champ, ChampSelect } from "@/components/formulaire/champ";
import { SectionFormulaire } from "@/components/formulaire/cadre-formulaire";
import { creerDevis } from "@/lib/actions/devis";
import { calculerMontants, formaterFCFA } from "@/lib/facturation/calcul";
import { useT } from "@/lib/i18n/contexte";

type Ligne = { cle: number; produitId: string; designation: string; quantite: string; prixUnitaire: string; tauxTVA: string };

const LIGNE_VIDE = { produitId: "", designation: "", quantite: "1", prixUnitaire: "0", tauxTVA: "19.25" };

export function FormulaireDevis({
  dealId,
  contactId,
  produits,
}: {
  dealId?: string;
  contactId?: string;
  produits: { id: string; nom: string; prixVente: number }[];
}) {
  const t = useT();
  const [etat, action, enCours] = useActionState(creerDevis, null);
  const [prochaineCle, setProchaineCle] = useState(1);
  const [lignes, setLignes] = useState<Ligne[]>([{ cle: 0, ...LIGNE_VIDE }]);

  function majLigne(index: number, champ: keyof Ligne, valeur: string) {
    setLignes((precedent) => precedent.map((l, i) => (i === index ? { ...l, [champ]: valeur } : l)));
  }

  // Choisir un produit du catalogue pré-remplit désignation/prix, sans
  // empêcher l'ajustement manuel ensuite — le texte libre reste toujours
  // possible en laissant "Aucun produit" (échange du 2026-09-07).
  function choisirProduit(index: number, produitId: string) {
    const p = produits.find((p) => p.id === produitId);
    setLignes((precedent) =>
      precedent.map((l, i) =>
        i === index ? { ...l, produitId, designation: p ? p.nom : l.designation, prixUnitaire: p ? String(p.prixVente) : l.prixUnitaire } : l
      )
    );
  }

  const enNombres = (l: Ligne) => ({ quantite: Number(l.quantite) || 0, prixUnitaire: Number(l.prixUnitaire) || 0, tauxTVA: Number(l.tauxTVA) || 0 });
  const montants = calculerMontants(lignes.map(enNombres));

  return (
    <form action={action} className="mt-6 flex max-w-4xl animate-in flex-col gap-7 duration-500 fade-in slide-in-from-bottom-2">
      {dealId ? <input type="hidden" name="dealId" value={dealId} /> : null}
      {contactId ? <input type="hidden" name="contactId" value={contactId} /> : null}

      <div className="rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-7">
        <SectionFormulaire titre={t("Validité")}>
          <Champ label={t("Valide jusqu'au")} id="dateValidite" name="dateValidite" type="date" required icone={CalendarClock} className="max-w-xs" />
        </SectionFormulaire>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="px-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase">{t("Lignes du devis")}</h2>
        {lignes.map((ligne, index) => {
          const totalLigne = calculerMontants([enNombres(ligne)]).montantTTC;
          return (
            <div key={ligne.cle} className="animate-in rounded-2xl border border-border bg-card p-4 shadow-xs duration-300 fade-in slide-in-from-top-2 focus-within:border-primary/40 focus-within:shadow-md">
              <input type="hidden" name="produitId" value={ligne.produitId} />
              <div className="grid gap-3 sm:grid-cols-[14rem_1fr]">
                <ChampSelect label={t("Produit")} value={ligne.produitId} onChange={(e) => choisirProduit(index, e.target.value)}>
                  <option value="">{t("Texte libre")}</option>
                  {produits.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nom}
                    </option>
                  ))}
                </ChampSelect>
                <Champ label={t("Désignation")} name="designation" required value={ligne.designation} onChange={(e) => majLigne(index, "designation", e.target.value)} />
              </div>
              <div className="mt-3 grid grid-cols-2 items-center gap-3 sm:grid-cols-[6rem_1fr_6rem_1fr_auto]">
                <Champ label={t("Qté")} name="quantite" type="number" step="0.01" min="0.01" required inputMode="decimal" value={ligne.quantite} onChange={(e) => majLigne(index, "quantite", e.target.value)} />
                <Champ label={t("Prix unit. (FCFA)")} name="prixUnitaire" type="number" min="0" required inputMode="numeric" value={ligne.prixUnitaire} onChange={(e) => majLigne(index, "prixUnitaire", e.target.value)} />
                <Champ label={t("TVA %")} name="tauxTVA" type="number" step="0.01" min="0" required inputMode="decimal" value={ligne.tauxTVA} onChange={(e) => majLigne(index, "tauxTVA", e.target.value)} />
                <p className="col-span-2 text-right text-sm text-muted-foreground sm:col-span-1">
                  {t("Total ligne TTC")}
                  <span className="block text-base font-semibold text-foreground tabular-nums">{formaterFCFA(totalLigne)}</span>
                </p>
                <Button type="button" variant="ghost" size="icon-lg" disabled={lignes.length === 1} onClick={() => setLignes((precedent) => precedent.filter((_, i) => i !== index))} aria-label={t("Retirer la ligne")} className="col-span-2 justify-self-end text-muted-foreground hover:text-destructive sm:col-span-1">
                  <Trash2 className="size-4" aria-hidden />
                </Button>
              </div>
            </div>
          );
        })}

        <Button
          type="button"
          variant="outline"
          size="lg"
          className="h-11 self-start border-dashed"
          onClick={() => {
            setLignes((p) => [...p, { cle: prochaineCle, ...LIGNE_VIDE }]);
            setProchaineCle((n) => n + 1);
          }}
        >
          <Plus data-icon="inline-start" aria-hidden />
          {t("Ajouter une ligne")}
        </Button>
      </div>

      <div className="rounded-3xl bg-gradient-to-br from-marque-bleu-50 to-background p-5 text-sm ring-1 ring-marque-bleu-100 sm:max-w-sm sm:self-end sm:p-6">
        <div className="flex justify-between">
          <span className="text-muted-foreground">{t("Montant HT")}</span>
          <span className="tabular-nums">{formaterFCFA(montants.montantHT)}</span>
        </div>
        <div className="mt-1 flex justify-between">
          <span className="text-muted-foreground">TVA</span>
          <span className="tabular-nums">{formaterFCFA(montants.montantTVA)}</span>
        </div>
        <div className="mt-3 flex items-end justify-between border-t border-marque-bleu-100 pt-3">
          <span className="font-medium">{t("Total TTC")}</span>
          <span key={montants.montantTTC} className="animate-in text-2xl font-bold tracking-tight text-primary tabular-nums duration-300 fade-in zoom-in-95">
            {formaterFCFA(montants.montantTTC)}
          </span>
        </div>
      </div>

      {etat?.erreur ? (
        <p role="alert" className="animate-in rounded-xl bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive fade-in slide-in-from-top-1">
          {etat.erreur}
        </p>
      ) : null}

      <Button type="submit" size="lg" disabled={enCours} className="h-12 self-start px-6 text-base">
        {enCours ? <Spinner data-icon="inline-start" /> : null}
        {enCours ? t("Création…") : t("Créer le devis")}
      </Button>
    </form>
  );
}
