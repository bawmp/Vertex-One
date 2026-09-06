import { redirect } from "next/navigation";
import Link from "next/link";
import { eq, desc } from "drizzle-orm";
import { ArrowLeft, Lock, FolderOpen } from "lucide-react";
import { avecEntreprise } from "@/db/client";
import { entreprise, documentFinancier, classeurDocumentFinancier, facture, paiement } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { disponible } from "@/lib/plans";
import { formaterFCFA } from "@/lib/facturation/calcul";
import { FormulaireTeleverserDocument } from "./formulaire-televerser-document";
import { FormulaireNouveauClasseur } from "./formulaire-nouveau-classeur";
import { VueDocumentsFinanciers } from "./vue-documents-financiers";

export default async function PageDocumentsFinanciers() {
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
      .select({ statutAbonnement: entreprise.statutAbonnement, planAbonnement: entreprise.planAbonnement })
      .from(entreprise)
      .where(eq(entreprise.id, utilisateurConnecte.entrepriseId));
    if (!disponible(monEntreprise, "COMPTABILITE_COMPLETE")) return null;

    const [documents, classeurs, factures, paiements] = await Promise.all([
      tx
        .select({
          id: documentFinancier.id,
          nom: documentFinancier.nom,
          classeurId: documentFinancier.classeurId,
          factureId: documentFinancier.factureId,
          paiementId: documentFinancier.paiementId,
          fournisseurOuVendeur: documentFinancier.fournisseurOuVendeur,
          montant: documentFinancier.montant,
          dateDocument: documentFinancier.dateDocument,
          creeLe: documentFinancier.creeLe,
        })
        .from(documentFinancier)
        .orderBy(desc(documentFinancier.creeLe)),
      tx.select({ id: classeurDocumentFinancier.id, nom: classeurDocumentFinancier.nom }).from(classeurDocumentFinancier),
      tx.select({ id: facture.id, numero: facture.numero, montantTTC: facture.montantTTC }).from(facture).orderBy(desc(facture.dateEmission)),
      tx
        .select({ id: paiement.id, montant: paiement.montant, moyenPaiement: paiement.moyenPaiement, datePaiement: paiement.datePaiement })
        .from(paiement)
        .orderBy(desc(paiement.datePaiement)),
    ]);

    return {
      documents,
      classeurs,
      factures: factures.map((f) => ({ id: f.id, libelle: `${f.numero} — ${formaterFCFA(f.montantTTC)}` })),
      paiements: paiements.map((p) => ({
        id: p.id,
        libelle: `${formaterFCFA(p.montant)} — ${p.moyenPaiement} (${new Intl.DateTimeFormat("fr-FR", { dateStyle: "short" }).format(p.datePaiement)})`,
      })),
    };
  });

  if (!donnees) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Lock className="size-8 text-muted-foreground" aria-hidden />
        <p className="text-muted-foreground">La comptabilité complète est disponible à partir du forfait Business.</p>
      </div>
    );
  }

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <div>
        <Link href="/app/comptabilite" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-3.5" aria-hidden />
          Comptabilité
        </Link>
        <div className="mt-1 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <FolderOpen className="size-5" aria-hidden />
            <h1 className="text-2xl font-semibold tracking-tight">Documents</h1>
          </div>
          <div className="flex items-center gap-2">
            <FormulaireNouveauClasseur />
            <FormulaireTeleverserDocument />
          </div>
        </div>
        <p className="mt-1 text-muted-foreground">
          Reçus, factures fournisseurs et relevés bancaires, rattachables à une facture ou un paiement — la saisie du
          fournisseur/montant reste manuelle (pas d&apos;extraction automatique pour le moment).
        </p>
      </div>

      <VueDocumentsFinanciers documents={donnees.documents} classeurs={donnees.classeurs} factures={donnees.factures} paiements={donnees.paiements} />
    </div>
  );
}
