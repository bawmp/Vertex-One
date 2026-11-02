import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { desc, eq, inArray } from "drizzle-orm";
import { ArrowLeft, Package, Lock, User, Clock, ArrowDownToLine, ArrowUpFromLine, ArrowRightLeft, ClipboardCheck, ShoppingCart, Truck, Flag } from "lucide-react";
import { avecEntreprise } from "@/db/client";
import { produit, compteComptable, utilisateur, mouvementStock } from "@/db/schema";
import { stockParDepot } from "@/lib/produits/depots";
import { gestionStockActive } from "@/lib/produits/gestion-stock";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { recupererTransactionsProduit } from "@/lib/produits/transactions";
import { formaterFCFA } from "@/lib/facturation/calcul";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsPanel } from "@/components/ui/tabs";
import { FormulaireImageProduit } from "./formulaire-image-produit";
import { FormulaireModifierProduit } from "./formulaire-modifier-produit";
import { AjusterStock } from "./ajuster-stock";
import { SeuilAlerte } from "./seuil-alerte";
import { TransfertStock } from "./transfert-stock";
import { niveauStock } from "@/lib/produits/niveau-stock";
import { MOTIFS_AJOUT, MOTIFS_RETRAIT, MOTIFS_INVENTAIRE } from "@/lib/produits/motifs-stock";
import { getT } from "@/lib/i18n/langue";

// Fiche détail Produit (échange du 2026-09-08, comparaison avec la fiche
// article Zoho Books) — page complète, cohérente avec toutes les autres
// fiches détail de ce produit (Deals, Contacts, Projets, Factures...),
// jamais une fenêtre modale (aucune de ce produit n'en est une).
export default async function PageDetailProduit({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ modifier?: string }> }) {
  const t = await getT();
  const { id } = await params;
  const { modifier } = await searchParams;
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");

  if (!peut(utilisateurConnecte, "PRODUITS", "VOIR")) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Lock className="size-8 text-muted-foreground" aria-hidden />
        <p className="text-muted-foreground">{t("Vous n'avez pas accès au catalogue Produits.")}</p>
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

    const mouvements = leProduit.type === "BIEN"
      ? await tx.select().from(mouvementStock).where(eq(mouvementStock.produitId, id)).orderBy(desc(mouvementStock.creeLe)).limit(100)
      : [];
    const idsAuteurs = [...new Set(mouvements.map((mv) => mv.creeParId).filter((v): v is string => Boolean(v)))];
    const auteurs = idsAuteurs.length > 0 ? await tx.select({ id: utilisateur.id, nomComplet: utilisateur.nomComplet }).from(utilisateur).where(inArray(utilisateur.id, idsAuteurs)) : [];

    const gereStock = await gestionStockActive(tx, utilisateurConnecte.entrepriseId);
    const depots = gereStock && leProduit.type === "BIEN" && leProduit.suiviStock ? await stockParDepot(tx, utilisateurConnecte.entrepriseId, id) : [];

    return { leProduit, createur, compteVente, transactions, mouvements, depots, gereStock, nomsAuteurs: new Map(auteurs.map((a) => [a.id, a.nomComplet])) };
  });

  if (!donnees) notFound();
  const { leProduit, createur, compteVente, transactions, mouvements, nomsAuteurs, depots, gereStock } = donnees;
  const depotsActifs = depots.filter((d) => d.actif);
  const nomsDepots = new Map(depots.map((d) => [d.depotId, d.nom]));
  const peutModifier = peut(utilisateurConnecte, "PRODUITS", "MODIFIER");

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <Link href="/app/produits" className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" aria-hidden />
        {t("Retour")}
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
            <Badge variant="neutral">{leProduit.type === "BIEN" ? t("Bien") : t("Service")}</Badge>
          </div>
          {leProduit.description ? <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{leProduit.description}</p> : null}
        </div>
      </div>

      {peutModifier ? (
        <FormulaireModifierProduit
          produit={{ id: leProduit.id, nom: leProduit.nom, description: leProduit.description, prixVente: leProduit.prixVente, prixAchat: leProduit.prixAchat }}
          ouvertParDefaut={modifier === "1"}
        />
      ) : null}

      <Tabs defaultValue="apercu">
        <TabsList>
          <TabsTrigger value="apercu">{t("Vue d'ensemble")}</TabsTrigger>
          {gereStock && leProduit.type === "BIEN" ? <TabsTrigger value="stock">{t("Stock")}</TabsTrigger> : null}
          <TabsTrigger value="transactions">{t("Transactions")}</TabsTrigger>
          <TabsTrigger value="historique">{t("Historique")}</TabsTrigger>
        </TabsList>

        <TabsPanel value="apercu" className="flex flex-col gap-4">
          <Card>
            <CardContent className="flex flex-col gap-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("Type d'élément")}</span>
                <span>{t("Articles en vente ({type})", { type: leProduit.type === "BIEN" ? t("Bien") : t("Service") })}</span>
              </div>
              {leProduit.type === "BIEN" && leProduit.suiviStock ? (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("Stock actuel")}</span>
                  <span>{leProduit.stockActuel}</span>
                </div>
              ) : null}
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">{t("Créé par")}</span>
                <span className="flex items-center gap-1.5">
                  <User className="size-3.5 text-muted-foreground" aria-hidden />
                  {createur?.nomComplet ?? "—"}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex flex-col gap-3 text-sm">
              <h2 className="text-sm font-medium text-muted-foreground">{t("Informations sur les ventes")}</h2>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("Prix de vente")}</span>
                <span className="font-medium tabular-nums">{formaterFCFA(leProduit.prixVente)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("Compte de vente")}</span>
                <span>{compteVente ? `${compteVente.numero} — ${compteVente.libelle}` : "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("Prix d'achat")}</span>
                <span className="tabular-nums">{formaterFCFA(leProduit.prixAchat)}</span>
              </div>
            </CardContent>
          </Card>

          {peutModifier ? (
            <Card>
              <CardContent className="flex flex-col gap-2">
                <h2 className="text-sm font-medium text-muted-foreground">{t("Image")}</h2>
                <FormulaireImageProduit produitId={leProduit.id} />
              </CardContent>
            </Card>
          ) : null}
        </TabsPanel>

        {gereStock && leProduit.type === "BIEN" ? (
          <TabsPanel value="stock" className="flex flex-col gap-4">
            {leProduit.suiviStock ? (
              <Card>
                <CardContent className="flex items-baseline justify-between gap-3">
                  <span className="text-sm text-muted-foreground">{t("Stock actuel")}</span>
                  <span className="flex items-center gap-3">
                    {niveauStock(leProduit) === "RUPTURE" ? <Badge variant="danger">{t("Épuisé")}</Badge> : niveauStock(leProduit) === "BAS" ? <Badge variant="warning">{t("Stock bas")}</Badge> : null}
                    <span className="text-3xl font-semibold tabular-nums">{leProduit.stockActuel}</span>
                  </span>
                </CardContent>
              </Card>
            ) : null}

            {leProduit.suiviStock && depotsActifs.length > 1 ? (
              <Card>
                <CardContent className="flex flex-col gap-2">
                  <h2 className="text-sm font-medium text-muted-foreground">{t("Répartition par dépôt")}</h2>
                  <div className="flex flex-col divide-y divide-border text-sm">
                    {depots.map((d) => (
                      <div key={d.depotId} className="flex items-center justify-between gap-3 py-1.5">
                        <span className="flex items-center gap-2">
                          {d.nom}
                          {d.principal ? <Badge variant="brand">{t("Principal")}</Badge> : null}
                          {!d.actif ? <Badge variant="neutral">{t("Archivé")}</Badge> : null}
                        </span>
                        <span className="tabular-nums font-medium">{d.quantite}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ) : null}

            {peutModifier ? <AjusterStock produitId={leProduit.id} suiviStock={leProduit.suiviStock} stockActuel={leProduit.stockActuel} depots={depotsActifs.map((d) => ({ id: d.depotId, nom: d.nom, principal: d.principal, quantite: d.quantite }))} /> : null}
            {peutModifier && leProduit.suiviStock && depotsActifs.length > 1 ? <TransfertStock produitId={leProduit.id} depots={depotsActifs.map((d) => ({ id: d.depotId, nom: d.nom, quantite: d.quantite }))} /> : null}
            {peutModifier && leProduit.suiviStock ? <SeuilAlerte produitId={leProduit.id} seuilActuel={leProduit.seuilAlerte} /> : null}

            {leProduit.suiviStock ? (
              <div className="flex flex-col gap-2">
                <h2 className="text-sm font-medium text-muted-foreground">{t("Historique du stock")}</h2>
                {mouvements.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("Aucun mouvement pour le moment. Chaque vente, achat ou correction apparaîtra ici.")}</p>
                ) : (
                  <Card className="p-0">
                    <div className="flex flex-col divide-y divide-border">
                      {mouvements.map((mv) => {
                        const Icone = mv.type === "TRANSFERT_SORTIE" || mv.type === "TRANSFERT_ENTREE" ? ArrowRightLeft : mv.type === "VENTE" ? ShoppingCart : mv.type === "ACHAT" ? Truck : mv.type === "AJOUT" ? ArrowDownToLine : mv.type === "RETRAIT" ? ArrowUpFromLine : mv.type === "INVENTAIRE" ? ClipboardCheck : Flag;
                        const titre =
                          mv.type === "VENTE" ? t("Vente") : mv.type === "ACHAT" ? t("Achat reçu") : mv.type === "AJOUT" ? t("Entrée de stock") : mv.type === "RETRAIT" ? t("Sortie de stock") : mv.type === "INVENTAIRE" ? t("Inventaire") : mv.type === "TRANSFERT_SORTIE" ? t("Transfert (sortie)") : mv.type === "TRANSFERT_ENTREE" ? t("Transfert (entrée)") : t("Stock de départ");
                        const motifs: Record<string, string> = { ...MOTIFS_AJOUT, ...MOTIFS_RETRAIT, ...MOTIFS_INVENTAIRE };
                        const detail = [depotsActifs.length > 1 && mv.depotId ? nomsDepots.get(mv.depotId) : null, mv.motif && motifs[mv.motif] ? t(motifs[mv.motif]) : null, mv.note, mv.creeParId ? nomsAuteurs.get(mv.creeParId) : null].filter(Boolean).join(" · ");
                        const lien = mv.documentType === "FACTURE" && mv.documentId ? `/app/facturation/factures/${mv.documentId}` : mv.documentType === "FACTURE_FOURNISSEUR" ? "/app/achats#factures-fournisseurs" : mv.documentType === "RECU_VENTE" ? "/app/facturation#tickets-de-vente" : null;
                        return (
                          <div key={mv.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                            <div className="flex min-w-0 items-center gap-3">
                              <Icone className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                              <div className="min-w-0">
                                <p className="truncate font-medium">
                                  {lien ? (
                                    <Link href={lien} className="hover:underline">
                                      {titre}
                                    </Link>
                                  ) : (
                                    titre
                                  )}
                                </p>
                                <p className="truncate text-xs text-muted-foreground">
                                  {new Intl.DateTimeFormat(t.locale, { dateStyle: "medium", timeStyle: "short" }).format(mv.creeLe)}
                                  {detail ? ` · ${detail}` : ""}
                                </p>
                              </div>
                            </div>
                            <div className="shrink-0 text-right tabular-nums">
                              <p className={mv.quantite > 0 ? "font-medium text-emerald-700 dark:text-emerald-400" : "font-medium text-destructive"}>{mv.quantite > 0 ? `+${mv.quantite}` : mv.quantite}</p>
                              <p className="text-xs text-muted-foreground">{t("Stock : {n}", { n: mv.stockApres })}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </Card>
                )}
              </div>
            ) : null}
          </TabsPanel>
        ) : null}

        <TabsPanel value="transactions">
          {transactions.length > 0 ? (
            <Card className="p-0">
              <div className="flex flex-col divide-y divide-border">
                {transactions.map((tx, index) => (
                  <Link
                    key={tx.id}
                    href={tx.lien}
                    style={{ animationDelay: `${Math.min(index, 8) * 30}ms` }}
                    className="group/ligne relative flex animate-in fade-in items-center justify-between gap-3 overflow-hidden px-4 py-3 text-sm fill-mode-both duration-300 hover:bg-muted/60"
                  >
                    <span aria-hidden className="absolute inset-y-0 left-0 w-0.5 scale-y-0 bg-primary transition-transform duration-150 group-hover/ligne:scale-y-100" />
                    <div className="min-w-0 transition-transform duration-150 group-hover/ligne:translate-x-1">
                      <p className="truncate font-medium">
                        {tx.type} — {tx.numero}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Intl.DateTimeFormat(t.locale, { dateStyle: "medium" }).format(tx.date)} · {tx.statut}
                      </p>
                    </div>
                    <span className="shrink-0 tabular-nums text-muted-foreground">{formaterFCFA(tx.montantLigne)}</span>
                  </Link>
                ))}
              </div>
            </Card>
          ) : (
            <p className="text-sm text-muted-foreground">{t("Ce produit n'apparaît encore sur aucun document.")}</p>
          )}
        </TabsPanel>

        <TabsPanel value="historique">
          <Card className="p-0">
            <div className="flex items-center gap-3 px-4 py-3 text-sm">
              <Clock className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span>
                {t("Créé le {date} par {nom}", { date: new Intl.DateTimeFormat(t.locale, { dateStyle: "long" }).format(leProduit.creeLe), nom: createur?.nomComplet ?? "—" })}
              </span>
            </div>
          </Card>
        </TabsPanel>
      </Tabs>
    </div>
  );
}
