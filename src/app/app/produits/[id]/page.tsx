import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { ArrowLeft, Package, Lock, User, Clock } from "lucide-react";
import { avecEntreprise } from "@/db/client";
import { produit, compteComptable, utilisateur } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { recupererTransactionsProduit } from "@/lib/produits/transactions";
import { formaterFCFA } from "@/lib/facturation/calcul";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsPanel } from "@/components/ui/tabs";
import { FormulaireImageProduit } from "./formulaire-image-produit";

// Fiche détail Produit (échange du 2026-09-08, comparaison avec la fiche
// article Zoho Books) — page complète, cohérente avec toutes les autres
// fiches détail de ce produit (Deals, Contacts, Projets, Factures...),
// jamais une fenêtre modale (aucune de ce produit n'en est une).
export default async function PageDetailProduit({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
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

  const donnees = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [leProduit] = await tx.select().from(produit).where(eq(produit.id, id));
    if (!leProduit) return null;

    const [[createur], [compteVente], transactions] = await Promise.all([
      tx.select({ nomComplet: utilisateur.nomComplet }).from(utilisateur).where(eq(utilisateur.id, leProduit.creeParId)),
      // "Compte de vente" reste informatif — le compte réellement utilisé
      // par genererEcrituresFactureEmise()/genererEcrituresRecuVente()
      // (src/lib/comptabilite/ecritures.ts), toujours 706000 quel que soit
      // le type BIEN/SERVICE, jamais configurable ici (échange du 2026-09-08).
      tx.select({ numero: compteComptable.numero, libelle: compteComptable.libelle }).from(compteComptable).where(eq(compteComptable.numero, "706000")),
      recupererTransactionsProduit(tx, utilisateurConnecte, id),
    ]);

    return { leProduit, createur, compteVente, transactions };
  });

  if (!donnees) notFound();
  const { leProduit, createur, compteVente, transactions } = donnees;
  const peutModifier = peut(utilisateurConnecte.role, "PRODUITS", "MODIFIER");

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <Link href="/app/produits" className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" aria-hidden />
        Retour
      </Link>

      <div className="flex items-center gap-4">
        {leProduit.imageCleStockage ? (
          // eslint-disable-next-line @next/next/no-img-element -- l'URL passe par une route de redirection signée, jamais un domaine fixe à déclarer dans next.config.
          <img src={`/app/produits/${leProduit.id}/image`} alt="" className="size-16 shrink-0 rounded-lg border object-cover" />
        ) : (
          <div className="flex size-16 shrink-0 items-center justify-center rounded-lg border bg-muted/40">
            <Package className="size-6 text-muted-foreground" aria-hidden />
          </div>
        )}
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{leProduit.nom}</h1>
            <Badge variant="neutral">{leProduit.type === "BIEN" ? "Bien" : "Service"}</Badge>
          </div>
          {leProduit.description ? <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{leProduit.description}</p> : null}
        </div>
      </div>

      <Tabs defaultValue="apercu">
        <TabsList>
          <TabsTrigger value="apercu">Vue d&apos;ensemble</TabsTrigger>
          <TabsTrigger value="transactions">Transactions</TabsTrigger>
          <TabsTrigger value="historique">Historique</TabsTrigger>
        </TabsList>

        <TabsPanel value="apercu" className="flex flex-col gap-4">
          <Card>
            <CardContent className="flex flex-col gap-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Type d&apos;élément</span>
                <span>Articles en vente ({leProduit.type === "BIEN" ? "Bien" : "Service"})</span>
              </div>
              {leProduit.type === "BIEN" && leProduit.suiviStock ? (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Stock actuel</span>
                  <span>{leProduit.stockActuel}</span>
                </div>
              ) : null}
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Créé par</span>
                <span className="flex items-center gap-1.5">
                  <User className="size-3.5 text-muted-foreground" aria-hidden />
                  {createur?.nomComplet ?? "—"}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex flex-col gap-3 text-sm">
              <h2 className="text-sm font-medium text-muted-foreground">Informations sur les ventes</h2>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Prix de vente</span>
                <span className="font-medium tabular-nums">{formaterFCFA(leProduit.prixVente)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Compte de vente</span>
                <span>{compteVente ? `${compteVente.numero} — ${compteVente.libelle}` : "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Prix d&apos;achat</span>
                <span className="tabular-nums">{formaterFCFA(leProduit.prixAchat)}</span>
              </div>
            </CardContent>
          </Card>

          {peutModifier ? (
            <Card>
              <CardContent className="flex flex-col gap-2">
                <h2 className="text-sm font-medium text-muted-foreground">Image</h2>
                <FormulaireImageProduit produitId={leProduit.id} />
              </CardContent>
            </Card>
          ) : null}
        </TabsPanel>

        <TabsPanel value="transactions">
          {transactions.length > 0 ? (
            <Card className="p-0">
              <div className="flex flex-col divide-y divide-border">
                {transactions.map((t) => (
                  <Link key={t.id} href={t.lien} className="flex items-center justify-between gap-3 px-4 py-3 text-sm transition-colors hover:bg-muted/60">
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {t.type} — {t.numero}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(t.date)} · {t.statut}
                      </p>
                    </div>
                    <span className="shrink-0 tabular-nums text-muted-foreground">{formaterFCFA(t.montantLigne)}</span>
                  </Link>
                ))}
              </div>
            </Card>
          ) : (
            <p className="text-sm text-muted-foreground">Ce produit n&apos;apparaît encore sur aucun document.</p>
          )}
        </TabsPanel>

        <TabsPanel value="historique">
          <Card className="p-0">
            <div className="flex items-center gap-3 px-4 py-3 text-sm">
              <Clock className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span>
                Créé le {new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(leProduit.creeLe)} par {createur?.nomComplet ?? "—"}
              </span>
            </div>
          </Card>
        </TabsPanel>
      </Tabs>
    </div>
  );
}
