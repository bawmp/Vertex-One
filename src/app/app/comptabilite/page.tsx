import { redirect } from "next/navigation";
import Link from "next/link";
import { eq, desc } from "drizzle-orm";
import { Calculator, Lock, AlertTriangle, Landmark, FolderOpen } from "lucide-react";
import { avecEntreprise } from "@/db/client";
import { entreprise, ecritureComptable, compteComptable } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { disponible } from "@/lib/plans";
import { calculerBalance, calculerCompteDeResultat, calculerBilan } from "@/lib/comptabilite/etats-financiers";
import { formaterFCFA } from "@/lib/facturation/calcul";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";

export default async function PageComptabilite() {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");

  // Réservé à l'Administrateur (docs/palier-4-*, section 5) — MANAGER/EMPLOYE
  // ont actions: [] sur COMPTABILITE dans la matrice, peut() renvoie donc
  // false pour eux ici.
  if (!peut(utilisateurConnecte.role, "COMPTABILITE", "VOIR")) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Lock className="size-8 text-muted-foreground" aria-hidden />
        <p className="text-muted-foreground">La comptabilité est réservée à l&apos;Administrateur.</p>
      </div>
    );
  }

  const donnees = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [monEntreprise] = await tx
      .select({ planAbonnement: entreprise.planAbonnement, statutAbonnement: entreprise.statutAbonnement })
      .from(entreprise)
      .where(eq(entreprise.id, utilisateurConnecte.entrepriseId));
    if (!disponible(monEntreprise, "COMPTABILITE_COMPLETE")) return null;

    const balance = await calculerBalance(tx, utilisateurConnecte.entrepriseId);
    const compteDeResultat = calculerCompteDeResultat(balance);
    const bilan = calculerBilan(balance);

    const dernieresEcritures = await tx
      .select({
        id: ecritureComptable.id,
        dateEcriture: ecritureComptable.dateEcriture,
        libelle: ecritureComptable.libelle,
        numeroCompte: compteComptable.numero,
        libelleCompte: compteComptable.libelle,
        debit: ecritureComptable.debit,
        credit: ecritureComptable.credit,
      })
      .from(ecritureComptable)
      .innerJoin(compteComptable, eq(ecritureComptable.compteId, compteComptable.id))
      .where(eq(ecritureComptable.entrepriseId, utilisateurConnecte.entrepriseId))
      .orderBy(desc(ecritureComptable.dateEcriture))
      .limit(50);

    return { compteDeResultat, bilan, dernieresEcritures };
  });

  if (!donnees) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Lock className="size-8 text-muted-foreground" aria-hidden />
        <p className="text-muted-foreground">La comptabilité complète est disponible à partir du forfait Business.</p>
      </div>
    );
  }

  const { compteDeResultat, bilan, dernieresEcritures } = donnees;

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Calculator className="size-5" aria-hidden />
          <h1 className="text-2xl font-semibold tracking-tight">Comptabilité</h1>
        </div>
        <div className="flex gap-2">
          <Link href="/app/comptabilite/documents" className={buttonVariants({ variant: "outline", size: "sm" })}>
            <FolderOpen data-icon="inline-start" aria-hidden />
            Documents
          </Link>
          <Link href="/app/comptabilite/rapprochement" className={buttonVariants({ variant: "outline", size: "sm" })}>
            <Landmark data-icon="inline-start" aria-hidden />
            Rapprochement bancaire
          </Link>
        </div>
      </div>

      <div className="flex items-start gap-2 rounded-md border border-amber-600/20 bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
        <AlertTriangle className="size-4 shrink-0" aria-hidden />
        <p>
          Ces états sont un brouillon généré automatiquement à partir de vos factures et paiements — à faire valider par
          votre comptable avant tout dépôt officiel auprès de la DGI. Ce n&apos;est pas un outil de télédéclaration fiscale.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Compte de résultat</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Produits</span>
              <span>{formaterFCFA(compteDeResultat.totalProduits)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Charges</span>
              <span>{formaterFCFA(compteDeResultat.totalCharges)}</span>
            </div>
            <div className="mt-1 flex justify-between border-t border-border pt-1 font-medium">
              <span>Résultat net</span>
              <span>{formaterFCFA(compteDeResultat.resultatNet)}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Bilan</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total actif</span>
              <span>{formaterFCFA(bilan.totalActif)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total passif</span>
              <span>{formaterFCFA(bilan.totalPassif)}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <div id="journal" className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">Journal des écritures (50 plus récentes)</h2>
        {dernieresEcritures.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune écriture pour le moment.</p>
        ) : (
          <Card className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="px-4 py-2 font-medium">Date</th>
                  <th className="px-4 py-2 font-medium">Libellé</th>
                  <th className="px-4 py-2 font-medium">Compte</th>
                  <th className="px-4 py-2 text-right font-medium">Débit</th>
                  <th className="px-4 py-2 text-right font-medium">Crédit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {dernieresEcritures.map((e) => (
                  <tr key={e.id}>
                    <td className="whitespace-nowrap px-4 py-2 text-muted-foreground">
                      {new Intl.DateTimeFormat("fr-FR", { dateStyle: "short" }).format(e.dateEcriture)}
                    </td>
                    <td className="px-4 py-2">{e.libelle}</td>
                    <td className="whitespace-nowrap px-4 py-2 text-muted-foreground">
                      {e.numeroCompte} — {e.libelleCompte}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-right">{e.debit > 0 ? formaterFCFA(e.debit) : ""}</td>
                    <td className="whitespace-nowrap px-4 py-2 text-right">{e.credit > 0 ? formaterFCFA(e.credit) : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>
    </div>
  );
}
