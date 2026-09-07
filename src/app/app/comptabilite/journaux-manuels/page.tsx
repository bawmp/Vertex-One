import { redirect } from "next/navigation";
import Link from "next/link";
import { eq, desc, isNotNull } from "drizzle-orm";
import { ArrowLeft, BookOpenText, Lock } from "lucide-react";
import { avecEntreprise } from "@/db/client";
import { entreprise, journalManuel, ecritureComptable, compteComptable } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { disponible } from "@/lib/plans";
import { formaterFCFA } from "@/lib/facturation/calcul";
import { Card } from "@/components/ui/card";
import { FormulaireJournalManuel } from "./formulaire-journal-manuel";

// Zoho Books > Comptable > "Journaux manuels" (échange du 2026-09-07) — la
// seule voie de ce produit pour écrire dans ecritureComptable sans passer
// par une Facture/Dépense/Paiement. Réservé à l'Administrateur, comme le
// reste du module Comptabilité (voir CLAUDE.md).
export default async function PageJournauxManuels() {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");

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

    const [journaux, lignes, comptes] = await Promise.all([
      tx.select().from(journalManuel).orderBy(desc(journalManuel.dateEcriture)),
      tx.select({ journalManuelId: ecritureComptable.journalManuelId, debit: ecritureComptable.debit }).from(ecritureComptable).where(isNotNull(ecritureComptable.journalManuelId)),
      tx.select({ id: compteComptable.id, numero: compteComptable.numero, libelle: compteComptable.libelle }).from(compteComptable).orderBy(compteComptable.numero),
    ]);

    const totalParJournal = new Map<string, number>();
    for (const l of lignes) {
      if (!l.journalManuelId) continue;
      totalParJournal.set(l.journalManuelId, (totalParJournal.get(l.journalManuelId) ?? 0) + l.debit);
    }

    return { journaux, totalParJournal, comptes };
  });

  if (!donnees) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Lock className="size-8 text-muted-foreground" aria-hidden />
        <p className="text-muted-foreground">La comptabilité complète est disponible à partir du forfait Business.</p>
      </div>
    );
  }

  const { journaux, totalParJournal, comptes } = donnees;
  const peutCreer = peut(utilisateurConnecte.role, "COMPTABILITE", "CREER");

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <Link href="/app/comptabilite" className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" aria-hidden />
        Retour
      </Link>

      <div className="flex items-center gap-2.5">
        <BookOpenText className="size-5" aria-hidden />
        <h1 className="text-2xl font-semibold tracking-tight">Journaux manuels</h1>
      </div>
      <p className="-mt-4 text-sm text-muted-foreground">
        Écritures saisies à la main (corrections, ajustements) — jamais générées automatiquement, contrairement aux écritures liées à une facture ou un paiement.
      </p>

      {peutCreer ? <FormulaireJournalManuel comptes={comptes} /> : null}

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">Historique</h2>
        <Card className="p-0">
          <div className="flex flex-col divide-y divide-border">
            {journaux.map((j) => (
              <div key={j.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {j.numero} — {j.libelle}
                  </p>
                  <p className="text-xs text-muted-foreground">{new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(j.dateEcriture)}</p>
                </div>
                <span className="shrink-0 tabular-nums text-muted-foreground">{formaterFCFA(totalParJournal.get(j.id) ?? 0)}</span>
              </div>
            ))}
            {journaux.length === 0 ? <p className="px-4 py-8 text-center text-muted-foreground">Aucun journal manuel pour le moment.</p> : null}
          </div>
        </Card>
      </div>
    </div>
  );
}
