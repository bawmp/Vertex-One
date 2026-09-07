import { redirect, notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { avecEntreprise } from "@/db/client";
import { deal, contact, compteClient, produit } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { FormulaireBonCommandeVente } from "./formulaire-bon-commande-vente";

export default async function PageNouveauBonCommandeVente({
  searchParams,
}: {
  searchParams: Promise<{ dealId?: string }>;
}) {
  const { dealId } = await searchParams;
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!dealId) notFound();

  const donnees = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [leDeal] = await tx.select().from(deal).where(eq(deal.id, dealId));
    if (!leDeal) return null;
    const [leContact] = await tx.select().from(contact).where(eq(contact.id, leDeal.contactId));
    const [leCompte] = leContact?.compteId ? await tx.select().from(compteClient).where(eq(compteClient.id, leContact.compteId)) : [null];
    const produits = await tx.select({ id: produit.id, nom: produit.nom, prixVente: produit.prixVente }).from(produit);
    return { deal: leDeal, contact: leContact, compte: leCompte, produits };
  });
  if (!donnees) notFound();

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-semibold tracking-tight">Nouveau bon de commande</h1>
      <p className="mt-1 text-muted-foreground">
        Pour le deal <span className="font-medium text-foreground">{donnees.deal.titre}</span> —{" "}
        {donnees.compte?.nom ?? donnees.contact?.nom}.
      </p>
      <FormulaireBonCommandeVente dealId={donnees.deal.id} produits={donnees.produits} />
    </div>
  );
}
