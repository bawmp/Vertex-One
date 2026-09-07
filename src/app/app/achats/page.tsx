import { redirect } from "next/navigation";
import Link from "next/link";
import { eq, desc, inArray } from "drizzle-orm";
import { ShoppingCart, Lock, UserPlus, FileText, ClipboardList, CreditCard, Undo2 } from "lucide-react";
import { avecEntreprise } from "@/db/client";
import { depense, fournisseur, compteComptable, deal, factureFournisseur, bonCommandeAchat, paiementEffectue, avoirFournisseur } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { idsVisibles } from "@/lib/portee";
import { formaterFCFA } from "@/lib/facturation/calcul";
import { STATUT_FACTURE_FOURNISSEUR, STATUT_BON_COMMANDE_ACHAT } from "@/lib/libelles";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FormulaireNouvelleDepense } from "./formulaire-nouvelle-depense";
import { BoutonMarquerPayee } from "./bouton-marquer-payee";
import { BoutonAnnulerFacture } from "./bouton-annuler-facture";
import { ConvertirBonCommande } from "./bons-commande/convertir-bon-commande";

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

    const baseFactures = tx
      .select({
        id: factureFournisseur.id,
        numero: factureFournisseur.numero,
        statut: factureFournisseur.statut,
        montantTTC: factureFournisseur.montantTTC,
        dateEcheance: factureFournisseur.dateEcheance,
        fournisseurNom: fournisseur.nom,
        assigneAId: factureFournisseur.assigneAId,
      })
      .from(factureFournisseur)
      .innerJoin(fournisseur, eq(factureFournisseur.fournisseurId, fournisseur.id))
      .orderBy(desc(factureFournisseur.dateFacture));

    const facturesFournisseur =
      visibles === "TOUT" ? await baseFactures : visibles.length === 0 ? [] : await baseFactures.where(inArray(factureFournisseur.assigneAId, visibles));

    const baseBonsCommande = tx
      .select({
        id: bonCommandeAchat.id,
        numero: bonCommandeAchat.numero,
        statut: bonCommandeAchat.statut,
        montantTTC: bonCommandeAchat.montantTTC,
        fournisseurNom: fournisseur.nom,
        assigneAId: bonCommandeAchat.assigneAId,
      })
      .from(bonCommandeAchat)
      .innerJoin(fournisseur, eq(bonCommandeAchat.fournisseurId, fournisseur.id))
      .orderBy(desc(bonCommandeAchat.dateCommande));

    const bonsCommande =
      visibles === "TOUT" ? await baseBonsCommande : visibles.length === 0 ? [] : await baseBonsCommande.where(inArray(bonCommandeAchat.assigneAId, visibles));

    // Paiements effectués/Avoirs fournisseur n'ont pas de assigneAId propre
    // (toujours rattachés à une Facture fournisseur précise) : la portée se
    // déduit de la Facture fournisseur visible correspondante — même patron
    // que Paiements reçus/Factures d'avoir côté Ventes (src/app/app/facturation/page.tsx).
    const idsFacturesFournisseurVisibles = new Set(facturesFournisseur.map((f) => f.id));
    const [paiementsEffectuesBrut, avoirsFournisseurBrut] = await Promise.all([
      tx
        .select({
          id: paiementEffectue.id,
          factureFournisseurId: paiementEffectue.factureFournisseurId,
          montant: paiementEffectue.montant,
          moyenPaiement: paiementEffectue.moyenPaiement,
          datePaiement: paiementEffectue.datePaiement,
        })
        .from(paiementEffectue)
        .orderBy(desc(paiementEffectue.datePaiement)),
      tx
        .select({ id: avoirFournisseur.id, factureFournisseurId: avoirFournisseur.factureFournisseurId, motif: avoirFournisseur.motif, creeLe: avoirFournisseur.creeLe })
        .from(avoirFournisseur)
        .orderBy(desc(avoirFournisseur.creeLe)),
    ]);
    const factureFournisseurParId = new Map(facturesFournisseur.map((f) => [f.id, f]));
    const paiementsEffectues = paiementsEffectuesBrut
      .filter((p) => idsFacturesFournisseurVisibles.has(p.factureFournisseurId))
      .map((p) => ({ ...p, numeroFacture: factureFournisseurParId.get(p.factureFournisseurId)?.numero ?? "", fournisseurNom: factureFournisseurParId.get(p.factureFournisseurId)?.fournisseurNom ?? "" }));
    const avoirsFournisseur = avoirsFournisseurBrut
      .filter((a) => idsFacturesFournisseurVisibles.has(a.factureFournisseurId))
      .map((a) => ({ ...a, numeroFacture: factureFournisseurParId.get(a.factureFournisseurId)?.numero ?? "", fournisseurNom: factureFournisseurParId.get(a.factureFournisseurId)?.fournisseurNom ?? "" }));

    const debutDuMois = new Date();
    debutDuMois.setDate(1);
    debutDuMois.setHours(0, 0, 0, 0);
    const totalDuMois = depenses
      .filter((d) => d.datePaiement >= debutDuMois)
      .reduce((somme, d) => somme + d.montantTTC, 0);

    return { fournisseurs, comptesCharge, deals, depenses, facturesFournisseur, bonsCommande, paiementsEffectues, avoirsFournisseur, totalDuMois };
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

      <div id="bons-de-commande" className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-muted-foreground">Bons de commande</h2>
          {peut(utilisateurConnecte.role, "ACHATS", "CREER") ? (
            <Button size="sm" variant="outline" render={<Link href="/app/achats/bons-commande/nouveau" />} nativeButton={false}>
              <ClipboardList data-icon="inline-start" aria-hidden />
              Nouveau bon de commande
            </Button>
          ) : null}
        </div>

        <Card className="p-0">
          <div className="flex flex-col divide-y divide-border">
            {donnees.bonsCommande.map((bc) => {
              const info = STATUT_BON_COMMANDE_ACHAT[bc.statut];
              return (
                <div key={bc.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {bc.numero} — {bc.fournisseurNom}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="tabular-nums font-medium">{formaterFCFA(bc.montantTTC)}</span>
                    <Badge variant={info?.variante ?? "neutral"}>{info?.libelle ?? bc.statut}</Badge>
                    {bc.statut === "BROUILLON" && peut(utilisateurConnecte.role, "ACHATS", "CREER") ? (
                      <ConvertirBonCommande bonCommandeAchatId={bc.id} />
                    ) : null}
                  </div>
                </div>
              );
            })}
            {donnees.bonsCommande.length === 0 ? (
              <p className="px-4 py-8 text-center text-muted-foreground">Aucun bon de commande pour le moment.</p>
            ) : null}
          </div>
        </Card>
      </div>

      <div id="factures-fournisseurs" className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-muted-foreground">Factures fournisseur</h2>
          {peut(utilisateurConnecte.role, "ACHATS", "CREER") ? (
            <Button size="sm" variant="outline" render={<Link href="/app/achats/factures/nouveau" />} nativeButton={false}>
              <FileText data-icon="inline-start" aria-hidden />
              Nouvelle facture fournisseur
            </Button>
          ) : null}
        </div>

        <Card className="p-0">
          <div className="flex flex-col divide-y divide-border">
            {donnees.facturesFournisseur.map((f) => {
              const info = STATUT_FACTURE_FOURNISSEUR[f.statut];
              return (
                <div key={f.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {f.numero} — {f.fournisseurNom}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Échéance {new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(f.dateEcheance)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="tabular-nums font-medium">{formaterFCFA(f.montantTTC)}</span>
                    <Badge variant={info?.variante ?? "neutral"}>{info?.libelle ?? f.statut}</Badge>
                    {f.statut === "EN_ATTENTE" && peut(utilisateurConnecte.role, "ACHATS", "MODIFIER") ? (
                      <>
                        <BoutonMarquerPayee factureFournisseurId={f.id} />
                        <BoutonAnnulerFacture factureFournisseurId={f.id} />
                      </>
                    ) : null}
                  </div>
                </div>
              );
            })}
            {donnees.facturesFournisseur.length === 0 ? (
              <p className="px-4 py-8 text-center text-muted-foreground">Aucune facture fournisseur pour le moment.</p>
            ) : null}
          </div>
        </Card>
      </div>

      <div id="depenses" className="flex flex-col gap-3">
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

      <div id="paiements-effectues" className="flex flex-col gap-3">
        <h2 className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <CreditCard className="size-4" aria-hidden />
          Paiements effectués
        </h2>
        <Card className="p-0">
          <div className="flex flex-col divide-y divide-border">
            {donnees.paiementsEffectues.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {p.numeroFacture} — {p.fournisseurNom}
                  </p>
                  <p className="text-xs text-muted-foreground">{new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(p.datePaiement)}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="tabular-nums font-medium">{formaterFCFA(p.montant)}</span>
                  <Badge variant="success">{p.moyenPaiement}</Badge>
                </div>
              </div>
            ))}
            {donnees.paiementsEffectues.length === 0 ? (
              <p className="px-4 py-8 text-center text-muted-foreground">Aucun paiement effectué pour le moment.</p>
            ) : null}
          </div>
        </Card>
      </div>

      <div id="avoirs-fournisseur" className="flex flex-col gap-3">
        <h2 className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Undo2 className="size-4" aria-hidden />
          Avoirs fournisseur
        </h2>
        <Card className="p-0">
          <div className="flex flex-col divide-y divide-border">
            {donnees.avoirsFournisseur.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {a.numeroFacture} — {a.fournisseurNom}
                  </p>
                  <p className="text-xs text-muted-foreground">{a.motif}</p>
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">{new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(a.creeLe)}</span>
              </div>
            ))}
            {donnees.avoirsFournisseur.length === 0 ? (
              <p className="px-4 py-8 text-center text-muted-foreground">Aucun avoir fournisseur pour le moment.</p>
            ) : null}
          </div>
        </Card>
      </div>

      <div id="fournisseurs" className="flex flex-col gap-3">
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
