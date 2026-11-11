import { redirect } from "next/navigation";
import Link from "next/link";
import { and, desc, eq, ne } from "drizzle-orm";
import { ArrowLeft, Gift, Lock, Trash2 } from "lucide-react";
import { avecEntreprise } from "@/db/client";
import { dossierRH, entreprise, prime, utilisateur } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { disponible } from "@/lib/plans";
import { libelleMois, libelleTypePrime } from "@/lib/rh/paie-regles";
import { supprimerPrime } from "@/lib/actions/paie";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { TuileChiffre } from "@/components/fiche/fiche-ui";
import { FormulairePrime } from "../[id]/formulaire-prime";
import { getT } from "@/lib/i18n/langue";

const formaterFCFA = (montant: number) => `${new Intl.NumberFormat("fr-FR").format(montant)} FCFA`;

/**
 * Registre des primes de l'entreprise. Réservé à l'Administrateur : les primes sont de la rémunération, au même titre que le salaire
 * (chaque personne retrouve les siennes sur sa propre fiche).
 */
export default async function PagePrimes() {
  const t = await getT();
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (utilisateurConnecte.role !== "ADMIN" || !peut(utilisateurConnecte, "RH", "VOIR")) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Lock className="size-8 text-muted-foreground" aria-hidden />
        <p className="text-muted-foreground">{t("Cette page est réservée à l'Administrateur.")}</p>
      </div>
    );
  }

  const donnees = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [monEntreprise] = await tx
      .select({ planAbonnement: entreprise.planAbonnement, statutAbonnement: entreprise.statutAbonnement })
      .from(entreprise)
      .where(eq(entreprise.id, utilisateurConnecte.entrepriseId));
    if (!disponible(monEntreprise, "RH")) return null;

    // `utilisateur` est en RLS permissive (Better-Auth) : le filtre sur l'entreprise est explicite.
    const personnes = await tx
      .select({ dossierRHId: dossierRH.id, nom: utilisateur.nomComplet })
      .from(dossierRH)
      .innerJoin(utilisateur, eq(dossierRH.utilisateurId, utilisateur.id))
      .where(and(eq(dossierRH.entrepriseId, utilisateurConnecte.entrepriseId), eq(utilisateur.entrepriseId, utilisateurConnecte.entrepriseId), ne(utilisateur.statut, "SUPPRIME")))
      .orderBy(utilisateur.nomComplet);

    const primes = await tx
      .select({ id: prime.id, type: prime.type, montant: prime.montant, moisConcerne: prime.moisConcerne, motif: prime.motif, paiementSalaireId: prime.paiementSalaireId, nom: utilisateur.nomComplet, dossierRHId: prime.dossierRHId })
      .from(prime)
      .innerJoin(dossierRH, eq(prime.dossierRHId, dossierRH.id))
      .innerJoin(utilisateur, eq(dossierRH.utilisateurId, utilisateur.id))
      .where(eq(prime.entrepriseId, utilisateurConnecte.entrepriseId))
      .orderBy(desc(prime.moisConcerne), desc(prime.creeLe))
      .limit(500);
    return { personnes, primes };
  });
  if (!donnees) return <p className="text-muted-foreground">{t("Ce module n'est pas disponible avec votre abonnement.")}</p>;

  const { personnes, primes } = donnees;
  const enAttente = primes.filter((p) => !p.paiementSalaireId);
  const totalEnAttente = enAttente.reduce((somme, p) => somme + p.montant, 0);

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <Link href="/app/rh" className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" aria-hidden />
        {t("Retour")}
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <Gift className="size-6 text-marque-orange-600" aria-hidden />
            {t("Primes")}
          </h1>
          <p className="text-sm text-muted-foreground">{t("Les primes accordées à l'équipe. Elles s'ajoutent au bulletin du prochain salaire payé.")}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <TuileChiffre valeur={enAttente.length} libelle={t("Primes en attente de paiement")} ton="bleu" />
        <TuileChiffre valeur={formaterFCFA(totalEnAttente)} libelle={t("Montant en attente")} />
      </div>

      <FormulairePrime personnes={personnes} />

      {primes.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("Aucune prime pour le moment.")}</p>
      ) : (
        <Card className="p-0">
          <div className="flex flex-col divide-y divide-border">
            {primes.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
                <div className="min-w-0">
                  <p className="font-medium">
                    <Link href={`/app/rh/${p.dossierRHId}`} className="hover:underline">
                      {p.nom}
                    </Link>{" "}
                    — {t(libelleTypePrime(p.type))} · {formaterFCFA(p.montant)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {libelleMois(p.moisConcerne, t.locale)}
                    {p.motif ? ` · ${p.motif}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {p.paiementSalaireId ? <Badge variant="success">{t("Payée")}</Badge> : <Badge variant="warning">{t("En attente")}</Badge>}
                  {!p.paiementSalaireId ? (
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
    </div>
  );
}
