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
import { Badge } from "@/components/ui/badge";
import { AjouterCompte } from "./ajouter-compte";
import { ActionsCompte } from "./actions-compte";
import { getT } from "@/lib/i18n/langue";
import { m } from "@/lib/i18n/catalogue";

// Zoho Books > Comptable > "Plan comptable" (échange du 2026-09-07). Lecture
// seule et référentiel SYSCOHADA fixe : compteComptable est une table
// globale, partagée entre toutes les entreprises (voir schema.ts) — jamais
// de création de compte personnalisé ici, contrairement à Zoho qui permet
// d'ajouter des comptes à volonté. Le solde par compte reste propre à
// l'entreprise connectée (calculerBalance()), les comptes sans écriture
// s'affichent quand même avec un solde à 0 (calculerBalance() ne renvoie que
// les comptes déjà mouvementés).
const LIBELLE_CLASSE: Record<number, string> = {
  1: m("Classe 1 — Comptes de ressources durables"),
  2: m("Classe 2 — Comptes d'actif immobilisé"),
  3: m("Classe 3 — Comptes de stocks"),
  4: m("Classe 4 — Comptes de tiers"),
  5: m("Classe 5 — Comptes de trésorerie"),
  6: m("Classe 6 — Comptes de charges"),
  7: m("Classe 7 — Comptes de produits"),
  8: m("Classe 8 — Autres charges et produits (HAO)"),
};

export default async function PagePlanComptable() {
  const t = await getT();
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");

  if (!peut(utilisateurConnecte, "COMPTABILITE", "VOIR")) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Lock className="size-8 text-muted-foreground" aria-hidden />
        <p className="text-muted-foreground">{t("La comptabilité est réservée à l'Administrateur.")}</p>
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
        <p className="text-muted-foreground">{t("Votre abonnement est suspendu : renouvelez-le pour accéder à cette fonctionnalité.")}</p>
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
        {t("Retour")}
      </Link>

      <div className="flex items-center gap-2.5">
        <BookText className="size-5" aria-hidden />
        <h1 className="text-2xl font-semibold tracking-tight">{t("Plan comptable")}</h1>
      </div>
      <p className="-mt-4 text-sm text-muted-foreground">
        {t("Référentiel SYSCOHADA, auquel vous pouvez ajouter vos propres comptes. Le solde affiché est propre à votre entreprise.")}
      </p>
      {peut(utilisateurConnecte, "COMPTABILITE", "CREER") ? <AjouterCompte /> : null}

      {[...comptesParClasse.keys()]
        .sort((a, b) => a - b)
        .map((classe) => (
          <div key={classe} className="flex flex-col gap-2">
            <h2 className="text-sm font-medium text-muted-foreground">{LIBELLE_CLASSE[classe] ? t(LIBELLE_CLASSE[classe]) : t("Classe {classe}", { classe })}</h2>
            <Card className="animate-in fade-in slide-in-from-bottom-1 p-0 duration-300 fill-mode-both">
              <div className="flex flex-col divide-y divide-border">
                {(comptesParClasse.get(classe) ?? []).map((c) => (
                  <div key={c.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-muted/40">
                    <span className="min-w-0 truncate">
                      <span className="font-mono text-xs text-muted-foreground">{c.numero}</span>
                      <span className="ml-2">{c.libelle}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-3">
                      {c.entrepriseId ? <Badge variant="brand">{t("Personnalisé")}</Badge> : null}
                      <span className="tabular-nums text-muted-foreground">{formaterFCFA(soldeParNumero.get(c.numero) ?? 0)}</span>
                      {c.entrepriseId && peut(utilisateurConnecte, "COMPTABILITE", "MODIFIER") ? <ActionsCompte compteId={c.id} libelle={c.libelle} /> : null}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        ))}
    </div>
  );
}
