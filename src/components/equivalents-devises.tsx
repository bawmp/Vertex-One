import { avecEntreprise } from "@/db/client";
import { listerTaux } from "@/lib/devises/taux";
import { convertirDepuisXaf, formaterMontantDevise, formaterTaux, tauxEnVigueur } from "@/lib/devises/regles";
import { getT } from "@/lib/i18n/langue";

/**
 * Équivalent d'un montant en FCFA dans les autres devises dont l'entreprise a enregistré le taux (Paramètres > Devises), au taux en
 * vigueur à la date du document. Indicatif : la comptabilité reste en FCFA. N'affiche rien sans taux.
 */
export async function EquivalentsDevises({ entrepriseId, montantXaf, date }: { entrepriseId: string; montantXaf: number; date: Date }) {
  const t = await getT();
  const taux = await avecEntreprise(entrepriseId, (tx) => listerTaux(tx, entrepriseId));
  const jour = date.toISOString().slice(0, 10);
  const devises = [...new Set(taux.map((x) => x.devise))];
  const lignes = devises.map((d) => tauxEnVigueur(taux, d, jour)).filter((x): x is NonNullable<typeof x> => x !== null);
  if (lignes.length === 0) return null;
  return (
    <div className="flex flex-col items-end gap-0.5 text-xs text-muted-foreground">
      {lignes.map((l) => (
        <p key={l.devise}>
          ≈ <span className="tabular-nums text-foreground">{formaterMontantDevise(convertirDepuisXaf(montantXaf, l.tauxMilliemes), l.devise, t.locale)}</span> · {t("taux {taux} du {date}", { taux: formaterTaux(l.tauxMilliemes), date: l.dateEffet.split("-").reverse().join("/") })}
        </p>
      ))}
    </div>
  );
}
