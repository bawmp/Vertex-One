import { eq } from "drizzle-orm";
import { redirect, notFound } from "next/navigation";
import { avecEntreprise } from "@/db/client";
import { produit, devis, ligneDevis, contact } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { idsVisibles } from "@/lib/portee";
import { produitsAuPrixDuClient } from "@/lib/produits/listes-prix";
import { convertirDepuisXaf } from "@/lib/devises/regles";
import { FormulaireDevis } from "../../nouveau/formulaire-devis";
import { getT } from "@/lib/i18n/langue";

export default async function PageModifierDevis({ params }: { params: Promise<{ id: string }> }) {
  const t = await getT();
  const { id } = await params;
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte, "FACTURATION", "MODIFIER")) redirect(`/app/facturation/devis/${id}`);

  const donnees = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const visibles = await idsVisibles(tx, utilisateurConnecte, "FACTURATION");
    const [d] = await tx.select().from(devis).where(eq(devis.id, id));
    if (!d || (visibles !== "TOUT" && !visibles.includes(d.assigneAId))) return null;
    const lignes = await tx.select().from(ligneDevis).where(eq(ligneDevis.devisId, id));
    const [client] = await tx.select().from(contact).where(eq(contact.id, d.contactId));
    const catalogue = await tx.select({ id: produit.id, nom: produit.nom, prixVente: produit.prixVente }).from(produit).where(eq(produit.actif, true));
    const produits = await produitsAuPrixDuClient(tx, utilisateurConnecte.entrepriseId, client?.listePrixId ?? null, catalogue);
    return { d, lignes, produits, nomClient: client?.nom ?? "" };
  });
  if (!donnees) notFound();
  const { d, lignes, produits, nomClient } = donnees;
  if (d.statut !== "BROUILLON" && d.statut !== "ENVOYE") redirect(`/app/facturation/devis/${id}`);

  const taux = d.devise ? d.tauxChangeMilliemes : null;
  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-semibold tracking-tight">{t("Modifier le devis {numero}", { numero: d.numero })}</h1>
      <p className="mt-1 text-muted-foreground">{t("Pour ")}{nomClient}.</p>
      {d.statut === "ENVOYE" ? (
        <p role="note" className="mt-3 rounded-xl bg-amber-50 px-3.5 py-2.5 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          {t("Ce devis a déjà été envoyé : son lien en ligne montrera aussitôt la version modifiée. Pensez à le renvoyer au client pour qu'il reçoive le PDF à jour.")}
        </p>
      ) : null}
      <FormulaireDevis
        produits={produits}
        modification={{
          devisId: d.id,
          dateValidite: d.dateValidite.toISOString().slice(0, 10),
          devise: d.devise,
          tauxMilliemes: taux,
          lignes: lignes.map((l) => ({
            produitId: l.produitId ?? "",
            designation: l.designation,
            quantite: String(l.quantite),
            prixUnitaire: String(taux ? convertirDepuisXaf(l.prixUnitaire, taux) : l.prixUnitaire),
            tauxTVA: String(l.tauxTVA),
          })),
        }}
      />
    </div>
  );
}
