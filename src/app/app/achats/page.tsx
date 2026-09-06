import { redirect } from "next/navigation";
import Link from "next/link";
import { eq, desc, inArray } from "drizzle-orm";
import { ShoppingCart, Lock, UserPlus } from "lucide-react";
import { avecEntreprise } from "@/db/client";
import { depense, fournisseur, compteComptable, deal } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { idsVisibles } from "@/lib/portee";
import { formaterFCFA } from "@/lib/facturation/calcul";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FormulaireNouvelleDepense } from "./formulaire-nouvelle-depense";

export default async function PageAchats() {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");

  if (!peut(utilisateurConnecte.role, "ACHATS", "VOIR")) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Lock className="size-8 text-muted-foreground" aria-hidden />
        <p className="text-muted-foreground">Vous n&apos;avez pas accès au module Achats.</p>
      </div>
    );
  }

  const donnees = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const visibles = await idsVisibles(tx, utilisateurConnecte, "ACHATS");

    const [fournisseurs, comptesCharge, deals] = await Promise.all([
      tx.select({ id: fournisseur.id, nom: fournisseur.nom, telephone: fournisseur.telephone, niu: fournisseur.niu }).from(fournisseur),
      tx.select({ id: compteComptable.id, numero: compteComptable.numero, libelle: compteComptable.libelle }).from(compteComptable).where(eq(compteComptable.classe, 6)),
      tx.select({ id: deal.id, titre: deal.titre }).from(deal).where(eq(deal.entrepriseId, utilisateurConnecte.entrepriseId)),
    ]);

    const baseDepenses = tx
      .select({
        id: depense.id,
        libelle: depense.libelle,
        montantTTC: depense.montantTTC,
        datePaiement: depense.datePaiement,
        moyenPaiement: depense.moyenPaiement,
        fournisseurNom: fournisseur.nom,
        categorieLibelle: compteComptable.libelle,
        assigneAId: depense.assigneAId,
      })
      .from(depense)
      .leftJoin(fournisseur, eq(depense.fournisseurId, fournisseur.id))
      .innerJoin(compteComptable, eq(depense.compteComptableId, compteComptable.id))
      .orderBy(desc(depense.datePaiement));

    const depenses =
      visibles === "TOUT" ? await baseDepenses : visibles.length === 0 ? [] : await baseDepenses.where(inArray(depense.assigneAId, visibles));

    const debutDuMois = new Date();
    debutDuMois.setDate(1);
    debutDuMois.setHours(0, 0, 0, 0);
    const totalDuMois = depenses
      .filter((d) => d.datePaiement >= debutDuMois)
      .reduce((somme, d) => somme + d.montantTTC, 0);

    return { fournisseurs, comptesCharge, deals, depenses, totalDuMois };
  });

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <ShoppingCart className="size-5" aria-hidden />
          <h1 className="text-2xl font-semibold tracking-tight">Achats</h1>
        </div>
        {peut(utilisateurConnecte.role, "ACHATS", "CREER") ? (
          <Button size="sm" variant="outline" render={<Link href="/app/achats/fournisseurs/nouveau" />} nativeButton={false}>
            <UserPlus data-icon="inline-start" aria-hidden />
            Nouveau fournisseur
          </Button>
        ) : null}
      </div>

      <Card className="w-fit px-4 py-3">
        <p className="text-sm text-muted-foreground">Dépenses ce mois-ci</p>
        <p className="text-2xl font-semibold tracking-tight">{formaterFCFA(donnees.totalDuMois)}</p>
      </Card>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-muted-foreground">Dépenses</h2>
          {peut(utilisateurConnecte.role, "ACHATS", "CREER") ? (
            <FormulaireNouvelleDepense comptesCharge={donnees.comptesCharge} fournisseurs={donnees.fournisseurs} deals={donnees.deals} />
          ) : null}
        </div>

        <Card className="p-0">
          <div className="flex flex-col divide-y divide-border">
            {donnees.depenses.map((d) => (
              <div key={d.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">{d.libelle}</p>
                  <p className="text-xs text-muted-foreground">
                    {d.categorieLibelle}
                    {d.fournisseurNom ? ` — ${d.fournisseurNom}` : ""} —{" "}
                    {new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(d.datePaiement)}
                  </p>
                </div>
                <span className="shrink-0 tabular-nums font-medium">{formaterFCFA(d.montantTTC)}</span>
              </div>
            ))}
            {donnees.depenses.length === 0 ? <p className="px-4 py-8 text-center text-muted-foreground">Aucune dépense pour le moment.</p> : null}
          </div>
        </Card>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">Fournisseurs</h2>
        <Card className="p-0">
          <div className="flex flex-col divide-y divide-border">
            {donnees.fournisseurs.map((f) => (
              <div key={f.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <span className="font-medium">{f.nom}</span>
                <span className="text-muted-foreground">{f.telephone}</span>
              </div>
            ))}
            {donnees.fournisseurs.length === 0 ? <p className="px-4 py-8 text-center text-muted-foreground">Aucun fournisseur pour le moment.</p> : null}
          </div>
        </Card>
      </div>
    </div>
  );
}
