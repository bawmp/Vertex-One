import { Download, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { supprimerPrime } from "@/lib/actions/paie";
import { libelleModePaiement, libelleMois, libelleTypePrime } from "@/lib/rh/paie-regles";
import { getT } from "@/lib/i18n/langue";
import { ActionsBulletin } from "./actions-bulletin";
import { FormulairePaiementSalaire } from "./formulaire-paiement-salaire";
import { FormulairePrime } from "./formulaire-prime";

export type PrimeAffichee = { id: string; type: string; montant: number; moisConcerne: string; motif: string | null; paiementSalaireId: string | null };
export type PaiementAffiche = { id: string; mois: string; net: number; totalPrimes: number; totalRetenues: number; retenues: { libelle: string; montant: number }[]; datePaiement: string; modePaiement: string; envoyeLe: Date | null };

const formaterFCFA = (montant: number) => `${new Intl.NumberFormat("fr-FR").format(montant)} FCFA`;

/**
 * Primes et bulletins de paie d'une personne, dans la carte « Rémunération » (donc visible de l'Administrateur et de la personne seulement).
 * Seul l'Administrateur accorde une prime ou enregistre un paiement ; la personne lit ses primes et télécharge ses bulletins.
 */
export async function BlocPaie({ dossierRHId, primes, paiements, estAdmin, salaireRenseigne }: { dossierRHId: string; primes: PrimeAffichee[]; paiements: PaiementAffiche[]; estAdmin: boolean; salaireRenseigne: boolean }) {
  const t = await getT();
  const enAttente = primes.filter((p) => !p.paiementSalaireId);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium">{t("Primes")}</h3>
        {estAdmin ? <FormulairePrime dossierRHId={dossierRHId} /> : null}
      </div>
      {primes.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("Aucune prime pour le moment.")}</p>
      ) : (
        <Card className="p-0">
          <div className="flex flex-col divide-y divide-border">
            {primes.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
                <div className="min-w-0">
                  <p className="font-medium">
                    {t(libelleTypePrime(p.type))} — {formaterFCFA(p.montant)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {libelleMois(p.moisConcerne, t.locale)}
                    {p.motif ? ` · ${p.motif}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {p.paiementSalaireId ? <Badge variant="success">{t("Payée")}</Badge> : <Badge variant="warning">{t("En attente")}</Badge>}
                  {estAdmin && !p.paiementSalaireId ? (
                    <form action={supprimerPrime}>
                      <input type="hidden" name="id" value={p.id} />
                      <button type="submit" className="text-muted-foreground transition-colors hover:text-destructive" aria-label={t("Retirer cette prime")}>
                        <Trash2 className="size-4" aria-hidden />
                      </button>
                    </form>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
        <h3 className="text-sm font-medium">{t("Bulletins de paie")}</h3>
      </div>
      {estAdmin ? <FormulairePaiementSalaire dossierRHId={dossierRHId} salaireRenseigne={salaireRenseigne} nbPrimesEnAttente={enAttente.length} /> : null}
      {estAdmin && !salaireRenseigne ? <p className="text-xs text-muted-foreground">{t("Renseignez d'abord le salaire de base pour enregistrer un paiement.")}</p> : null}
      {paiements.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("Aucun salaire payé pour le moment.")}</p>
      ) : (
        <Card className="p-0">
          <div className="flex flex-col divide-y divide-border">
            {paiements.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    <span className="capitalize">{libelleMois(p.mois, t.locale)}</span>
                    {estAdmin ? p.envoyeLe ? <Badge variant="success">{t("Envoyé")}</Badge> : <Badge variant="warning">{t("Brouillon : non envoyé")}</Badge> : null}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("Net payé : {montant}", { montant: formaterFCFA(p.net) })} · {t(libelleModePaiement(p.modePaiement))}
                  </p>
                </div>
                <a
                  href={`/app/rh/${dossierRHId}/bulletins/${p.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted/70"
                >
                  <Download className="size-3.5" aria-hidden />
                  {t("Bulletin PDF")}
                </a>
                {estAdmin ? <ActionsBulletin paiementId={p.id} envoye={Boolean(p.envoyeLe)} datePaiement={p.datePaiement} modePaiement={p.modePaiement} retenues={p.retenues} /> : null}
              </div>
            ))}
          </div>
        </Card>
      )}
    </>
  );
}
