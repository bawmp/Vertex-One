import { redirect } from "next/navigation";
import { desc } from "drizzle-orm";
import { Package, Lock } from "lucide-react";
import { avecEntreprise } from "@/db/client";
import { produit } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { formaterFCFA } from "@/lib/facturation/calcul";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FormulaireNouveauProduit } from "./formulaire-nouveau-produit";
import { BoutonSupprimerProduit } from "./bouton-supprimer-produit";

export default async function PageProduits() {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");

  if (!peut(utilisateurConnecte.role, "PRODUITS", "VOIR")) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Lock className="size-8 text-muted-foreground" aria-hidden />
        <p className="text-muted-foreground">Vous n&apos;avez pas accès au catalogue Produits.</p>
      </div>
    );
  }

  const produits = await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) => tx.select().from(produit).orderBy(desc(produit.creeLe)));

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Package className="size-5" aria-hidden />
          <h1 className="text-2xl font-semibold tracking-tight">Produits</h1>
        </div>
        {peut(utilisateurConnecte.role, "PRODUITS", "CREER") ? <FormulaireNouveauProduit /> : null}
      </div>

      <Card className="p-0">
        <div className="flex flex-col divide-y divide-border">
          {produits.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="truncate font-medium">{p.nom}</p>
                  <Badge variant="neutral">{p.type === "BIEN" ? "Bien" : "Service"}</Badge>
                  {p.suiviStock ? <Badge variant="info">Stock : {p.stockActuel}</Badge> : null}
                </div>
                {p.description ? <p className="truncate text-xs text-muted-foreground">{p.description}</p> : null}
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <div className="text-right text-xs text-muted-foreground">
                  <p>Vente : {formaterFCFA(p.prixVente)}</p>
                  <p>Achat : {formaterFCFA(p.prixAchat)}</p>
                </div>
                {peut(utilisateurConnecte.role, "PRODUITS", "SUPPRIMER") ? <BoutonSupprimerProduit produitId={p.id} /> : null}
              </div>
            </div>
          ))}
          {produits.length === 0 ? <p className="px-4 py-8 text-center text-muted-foreground">Aucun produit pour le moment.</p> : null}
        </div>
      </Card>
    </div>
  );
}
