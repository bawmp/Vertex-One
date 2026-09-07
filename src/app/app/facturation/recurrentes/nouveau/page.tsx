import { redirect, notFound } from "next/navigation";
import { avecEntreprise } from "@/db/client";
import { produit } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { resoudreDonneesClientPage } from "@/lib/facturation/client-document";
import { FormulaireFactureRecurrente } from "./formulaire-facture-recurrente";

export default async function PageNouvelleFactureRecurrente({
  searchParams,
}: {
  searchParams: Promise<{ dealId?: string; contactId?: string }>;
}) {
  const { dealId, contactId } = await searchParams;
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!dealId && !contactId) notFound();

  const donnees = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const client = await resoudreDonneesClientPage(tx, { dealId, contactId });
    if (!client) return null;
    const produits = await tx.select({ id: produit.id, nom: produit.nom, prixVente: produit.prixVente }).from(produit);
    return { ...client, produits };
  });
  if (!donnees) notFound();

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-semibold tracking-tight">Nouvelle facture récurrente</h1>
      <p className="mt-1 text-muted-foreground">
        {donnees.dealId ? (
          <>
            Pour le deal <span className="font-medium text-foreground">{donnees.titreDeal}</span> —{" "}
          </>
        ) : (
          "Pour "
        )}
        {donnees.compte?.nom ?? donnees.contact?.nom}.
      </p>
      <FormulaireFactureRecurrente dealId={donnees.dealId ?? undefined} contactId={donnees.dealId ? undefined : donnees.contactId} produits={donnees.produits} />
    </div>
  );
}
