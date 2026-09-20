import { LogoEntreprise } from "@/components/logo-entreprise";
import { formaterFCFA } from "@/lib/facturation/calcul";

type Ligne = { id: string; designation: string; quantite: number; prixUnitaire: number; tauxTVA: number };

/**
 * Habillage commun des pages publiques envoyées au client (devis, facture) : fond
 * aux couleurs de la marque, logo de l'entreprise émettrice (les mêmes propriétés
 * que partout ailleurs — voir LogoEntreprise), contenu dans une carte.
 */
export function CadreDocumentClient({ entrepriseId, logoCleStockage, nomEntreprise, children }: { entrepriseId: string; logoCleStockage: string | null; nomEntreprise: string; children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen flex-col items-center gap-6 overflow-hidden bg-gradient-to-br from-marque-bleu-800 via-marque-bleu to-marque-bleu-900 p-4 py-10">
      <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 size-96 rounded-full bg-marque-orange/25 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -left-16 bottom-0 size-72 rounded-full bg-marque-bleu-300/20 blur-3xl" />
      <LogoEntreprise taille="bandeau" entrepriseId={entrepriseId} logoCleStockage={logoCleStockage} nomEntreprise={nomEntreprise} className="relative" />
      <div className="relative flex w-full max-w-2xl flex-col gap-4 rounded-xl bg-background p-5 text-foreground shadow-lg sm:p-6">{children}</div>
    </div>
  );
}

export function LignesDocumentClient({ lignes, montantHT, montantTVA, montantTTC }: { lignes: Ligne[]; montantHT: number; montantTVA: number; montantTTC: number }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-muted-foreground">
              <th className="px-3 py-2 font-medium">Désignation</th>
              <th className="px-3 py-2 text-right font-medium">Qté</th>
              <th className="px-3 py-2 text-right font-medium">Prix unit.</th>
              <th className="px-3 py-2 text-right font-medium">TVA</th>
            </tr>
          </thead>
          <tbody>
            {lignes.map((l) => (
              <tr key={l.id} className="border-b last:border-0">
                <td className="px-3 py-2">{l.designation}</td>
                <td className="px-3 py-2 text-right tabular-nums">{l.quantite}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formaterFCFA(l.prixUnitaire)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{l.tauxTVA}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-col items-end gap-0.5 border-t bg-muted/20 px-3 py-3 text-sm">
        <p className="text-muted-foreground">
          HT : <span className="tabular-nums text-foreground">{formaterFCFA(montantHT)}</span>
        </p>
        <p className="text-muted-foreground">
          TVA : <span className="tabular-nums text-foreground">{formaterFCFA(montantTVA)}</span>
        </p>
        <p className="text-lg font-semibold">
          Total TTC : <span className="tabular-nums">{formaterFCFA(montantTTC)}</span>
        </p>
      </div>
    </div>
  );
}
