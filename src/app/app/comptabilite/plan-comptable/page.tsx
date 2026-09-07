import { redirect } from "next/navigation";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { ArrowLeft, BookText, Lock } from "lucide-react";
import { avecEntreprise } from "@/db/client";
import { entreprise, compteComptable } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { disponible } from "@/lib/plans";
import { calculerBalance } from "@/lib/comptabilite/etats-financiers";
import { formaterFCFA } from "@/lib/facturation/calcul";
import { Card } from "@/components/ui/card";

// Zoho Books > Comptable > "Plan comptable" (échange du 2026-09-07). Lecture
// seule et référentiel SYSCOHADA fixe : compteComptable est une table
// globale, partagée entre toutes les entreprises (voir schema.ts) — jamais
// de création de compte personnalisé ici, contrairement à Zoho qui permet
// d'ajouter des comptes à volonté. Le solde par compte reste propre à
// l'entreprise connectée (calculerBalance()), les comptes sans écriture
// s'affichent quand même avec un solde à 0 (calculerBalance() ne renvoie que
// les comptes déjà mouvementés).
const LIBELLE_CLASSE: Record<number, string> = {
  1: "Classe 1 — Comptes de ressources durables",
  2: "Classe 2 — Comptes d'actif immobilisé",
  3: "Classe 3 — Comptes de stocks",
  4: "Classe 4 — Comptes de tiers",
  5: "Classe 5 — Comptes de trésorerie",
  6: "Classe 6 — Comptes de charges",
  7: "Classe 7 — Comptes de produits",
  8: "Classe 8 — Autres charges et produits (HAO)",
};

export default async function PagePlanComptable() {
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

    const [comptes, balance] = await Promise.all([
      tx.select().from(compteComptable).orderBy(compteComptable.numero),
      calculerBalance(tx, utilisateurConnecte.entrepriseId),
    ]);
    const soldeParNumero = new Map(balance.map((l) => [l.numero, l.solde]));

    return { comptes, soldeParNumero };
  });

  if (!donnees) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Lock className="size-8 text-muted-foreground" aria-hidden />
        <p className="text-muted-foreground">La comptabilité complète est disponible à partir du forfait Business.</p>
      </div>
    );
  }

  const { comptes, soldeParNumero } = donnees;
  const comptesParClasse = new Map<number, typeof comptes>();
  for (const c of comptes) {
    comptesParClasse.set(c.classe, [...(comptesParClasse.get(c.classe) ?? []), c]);
  }

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <Link href="/app/comptabilite" className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" aria-hidden />
        Retour
      </Link>

      <div className="flex items-center gap-2.5">
        <BookText className="size-5" aria-hidden />
        <h1 className="text-2xl font-semibold tracking-tight">Plan comptable</h1>
      </div>
      <p className="-mt-4 text-sm text-muted-foreground">
        Référentiel SYSCOHADA — commun à toutes les classes de comptes, pas de compte personnalisé. Le solde affiché est propre à votre entreprise.
      </p>

      {[...comptesParClasse.keys()]
        .sort((a, b) => a - b)
        .map((classe) => (
          <div key={classe} className="flex flex-col gap-2">
            <h2 className="text-sm font-medium text-muted-foreground">{LIBELLE_CLASSE[classe] ?? `Classe ${classe}`}</h2>
            <Card className="p-0">
              <div className="flex flex-col divide-y divide-border">
                {(comptesParClasse.get(classe) ?? []).map((c) => (
                  <div key={c.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                    <span className="min-w-0 truncate">
                      <span className="font-mono text-xs text-muted-foreground">{c.numero}</span>
                      <span className="ml-2">{c.libelle}</span>
                    </span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">{formaterFCFA(soldeParNumero.get(c.numero) ?? 0)}</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        ))}
    </div>
  );
}
