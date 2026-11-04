import { redirect, notFound } from "next/navigation";
import { avecEntreprise } from "@/db/client";
import { produit } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { resoudreDonneesClientPage } from "@/lib/facturation/client-document";
import { produitsAuPrixDuClient } from "@/lib/produits/listes-prix";
import { FormulaireDevis } from "./formulaire-devis";
import { getT } from "@/lib/i18n/langue";
import { listerTaux } from "@/lib/devises/taux";
import { tauxEnVigueur } from "@/lib/devises/regles";
import { deviseFactureValide } from "@/lib/devises/facture";

export default async function PageNouveauDevis({
  searchParams,
}: {
  searchParams: Promise<{ dealId?: string; contactId?: string }>;
}) {
  const t = await getT();
  const { dealId, contactId } = await searchParams;
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!dealId && !contactId) notFound();

  const donnees = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const client = await resoudreDonneesClientPage(tx, { dealId, contactId });
    if (!client) return null;
    const catalogue = await tx.select({ id: produit.id, nom: produit.nom, prixVente: produit.prixVente }).from(produit);
    const produits = await produitsAuPrixDuClient(tx, utilisateurConnecte.entrepriseId, client.contact.listePrixId, catalogue);
    // Devises proposées : celles dont un taux est en vigueur aujourd'hui (le XOF, à parité avec le FCFA, n'a pas lieu d'être converti).
    const taux = await listerTaux(tx, utilisateurConnecte.entrepriseId);
    const jour = new Date().toISOString().slice(0, 10);
    const devises = [...new Set(taux.map((x) => x.devise))]
      .filter((d) => deviseFactureValide(d) && d !== "XOF")
      .map((d) => tauxEnVigueur(taux, d, jour))
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .map((x) => ({ devise: x.devise, tauxMilliemes: x.tauxMilliemes }));
    return { ...client, produits, devises };
  });
  if (!donnees) notFound();

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-semibold tracking-tight">{t("Nouveau devis")}</h1>
      <p className="mt-1 text-muted-foreground">
        {donnees.dealId ? (
          <>
            {t("Pour le deal")} <span className="font-medium text-foreground">{donnees.titreDeal}</span> —{" "}
          </>
        ) : (
          t("Pour ")
        )}
        {donnees.compte?.nom ?? donnees.contact?.nom}.
      </p>
      <FormulaireDevis dealId={donnees.dealId ?? undefined} contactId={donnees.dealId ? undefined : donnees.contactId} produits={donnees.produits} devises={donnees.devises} />
    </div>
  );
}
