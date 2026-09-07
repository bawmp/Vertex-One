import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { eq, desc } from "drizzle-orm";
import { Building2, Phone, ArrowRightCircle, FileText, ClipboardList, Repeat, Receipt } from "lucide-react";
import { avecEntreprise } from "@/db/client";
import { deal, contact, compteClient, devis, facture, bonCommandeVente, factureRecurrente, recuVente, historiqueStatutDeal, utilisateur } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { idsVisibles } from "@/lib/portee";
import {
  STATUT_DEAL,
  STATUT_DEVIS,
  STATUT_FACTURE,
  STATUT_BON_COMMANDE_VENTE,
  STATUT_FACTURE_RECURRENTE,
  FREQUENCE_FACTURE_RECURRENTE,
  STATUT_RECU_VENTE,
} from "@/lib/libelles";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChangeurStatutDeal } from "./changeur-statut-deal";
import { BoutonConvertirBCV } from "./bouton-convertir-bcv";
import { BoutonsFactureRecurrente } from "./boutons-facture-recurrente";
import { BoutonAnnulerRecuVente } from "./bouton-annuler-recu-vente";

export default async function PageFicheDeal({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");

  const donnees = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const visibles = await idsVisibles(tx, utilisateurConnecte, "CRM");

    const [ligne] = await tx.select().from(deal).where(eq(deal.id, id));
    if (!ligne) return null;
    if (visibles !== "TOUT" && !visibles.includes(ligne.assigneAId)) return null;

    const [[leContact], compte, devisListe, facturesListe, bonsCommandeListe, facturesRecurrentesListe, recusVenteListe, historique] = await Promise.all([
      tx.select().from(contact).where(eq(contact.id, ligne.contactId)),
      ligne.compteId ? tx.select().from(compteClient).where(eq(compteClient.id, ligne.compteId)) : Promise.resolve([null]),
      tx.select().from(devis).where(eq(devis.dealId, id)).orderBy(desc(devis.creeLe)),
      tx.select().from(facture).where(eq(facture.dealId, id)).orderBy(desc(facture.dateEmission)),
      tx.select().from(bonCommandeVente).where(eq(bonCommandeVente.dealId, id)).orderBy(desc(bonCommandeVente.dateCommande)),
      tx.select().from(factureRecurrente).where(eq(factureRecurrente.dealId, id)).orderBy(desc(factureRecurrente.creeLe)),
      tx.select().from(recuVente).where(eq(recuVente.dealId, id)).orderBy(desc(recuVente.dateEmission)),
      tx
        .select({
          id: historiqueStatutDeal.id,
          ancienStatut: historiqueStatutDeal.ancienStatut,
          nouveauStatut: historiqueStatutDeal.nouveauStatut,
          modifieLe: historiqueStatutDeal.modifieLe,
          auteur: utilisateur.nomComplet,
        })
        .from(historiqueStatutDeal)
        .innerJoin(utilisateur, eq(historiqueStatutDeal.modifieParId, utilisateur.id))
        .where(eq(historiqueStatutDeal.dealId, id))
        .orderBy(desc(historiqueStatutDeal.modifieLe)),
    ]);

    return {
      fiche: ligne,
      contact: leContact,
      compte: Array.isArray(compte) ? compte[0] : compte,
      devisListe,
      facturesListe,
      bonsCommandeListe,
      facturesRecurrentesListe,
      recusVenteListe,
      historique,
    };
  });

  if (!donnees) notFound();
  const { fiche, contact: leContact, compte, devisListe, facturesListe, bonsCommandeListe, facturesRecurrentesListe, recusVenteListe, historique } = donnees;
  const info = STATUT_DEAL[fiche.statut];
  const peutModifier = peut(utilisateurConnecte.role, "CRM", "MODIFIER");
  const peutCreerDevis = peut(utilisateurConnecte.role, "FACTURATION", "CREER");

  return (
    <div className="flex max-w-5xl flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-semibold tracking-tight">{fiche.titre}</h1>
            <Badge variant={info?.variante ?? "neutral"}>{info?.libelle ?? fiche.statut}</Badge>
          </div>
          <p className="mt-1 text-lg font-medium text-muted-foreground">{new Intl.NumberFormat("fr-FR").format(fiche.montant)} FCFA</p>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {leContact ? (
              <Link href={`/app/contacts/${leContact.id}`} className="flex items-center gap-1.5 hover:underline">
                <Phone className="size-3.5" aria-hidden />
                {leContact.nom}
              </Link>
            ) : null}
            {compte ? (
              <Link href={`/app/comptes/${compte.id}`} className="flex items-center gap-1.5 hover:underline">
                <Building2 className="size-3.5" aria-hidden />
                {compte.nom}
              </Link>
            ) : null}
          </div>
        </div>

        {peutCreerDevis ? (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" render={<Link href={`/app/facturation/devis/nouveau?dealId=${fiche.id}`} />} nativeButton={false}>
              <FileText data-icon="inline-start" aria-hidden />
              Créer un devis
            </Button>
            <Button
              size="sm"
              variant="outline"
              render={<Link href={`/app/facturation/bons-commande/nouveau?dealId=${fiche.id}`} />}
              nativeButton={false}
            >
              <ClipboardList data-icon="inline-start" aria-hidden />
              Créer un bon de commande
            </Button>
            <Button
              size="sm"
              variant="outline"
              render={<Link href={`/app/facturation/recurrentes/nouveau?dealId=${fiche.id}`} />}
              nativeButton={false}
            >
              <Repeat data-icon="inline-start" aria-hidden />
              Créer une facture récurrente
            </Button>
            <Button
              size="sm"
              variant="outline"
              render={<Link href={`/app/facturation/recus-vente/nouveau?dealId=${fiche.id}`} />}
              nativeButton={false}
            >
              <Receipt data-icon="inline-start" aria-hidden />
              Créer un reçu de vente
            </Button>
          </div>
        ) : null}
      </div>

      {peutModifier ? <ChangeurStatutDeal dealId={fiche.id} statutActuel={fiche.statut} /> : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-muted-foreground">Bons de commande</h2>
          {bonsCommandeListe.length > 0 ? (
            <Card className="p-0">
              <div className="flex flex-col divide-y divide-border">
                {bonsCommandeListe.map((bc) => {
                  const infoBC = STATUT_BON_COMMANDE_VENTE[bc.statut];
                  return (
                    <div key={bc.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                      <span className="font-medium">{bc.numero}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">{new Intl.NumberFormat("fr-FR").format(bc.montantTTC)} FCFA</span>
                        <Badge variant={infoBC?.variante ?? "neutral"}>{infoBC?.libelle ?? bc.statut}</Badge>
                        {bc.statut === "BROUILLON" && peutCreerDevis ? <BoutonConvertirBCV bonCommandeVenteId={bc.id} /> : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          ) : (
            <p className="text-sm text-muted-foreground">Aucun bon de commande pour le moment.</p>
          )}

          <h2 className="mt-3 text-sm font-medium text-muted-foreground">Factures récurrentes</h2>
          {facturesRecurrentesListe.length > 0 ? (
            <Card className="p-0">
              <div className="flex flex-col divide-y divide-border">
                {facturesRecurrentesListe.map((fr) => {
                  const infoStatut = STATUT_FACTURE_RECURRENTE[fr.statut];
                  const infoFrequence = FREQUENCE_FACTURE_RECURRENTE[fr.frequence];
                  return (
                    <div key={fr.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                      <span className="min-w-0 truncate">
                        <span className="font-medium">{fr.libelle}</span>
                        <span className="text-muted-foreground"> — {infoFrequence?.libelle ?? fr.frequence}</span>
                      </span>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="text-xs text-muted-foreground">{new Intl.NumberFormat("fr-FR").format(fr.montantTTC)} FCFA</span>
                        <Badge variant={infoStatut?.variante ?? "neutral"}>{infoStatut?.libelle ?? fr.statut}</Badge>
                        {peutCreerDevis && fr.statut !== "TERMINE" ? (
                          <BoutonsFactureRecurrente factureRecurrenteId={fr.id} statut={fr.statut} />
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          ) : (
            <p className="text-sm text-muted-foreground">Aucune facture récurrente pour le moment.</p>
          )}

          <h2 className="mt-3 text-sm font-medium text-muted-foreground">Reçus de vente</h2>
          {recusVenteListe.length > 0 ? (
            <Card className="p-0">
              <div className="flex flex-col divide-y divide-border">
                {recusVenteListe.map((rv) => {
                  const infoRecu = STATUT_RECU_VENTE[rv.statut];
                  return (
                    <div key={rv.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                      <span className="font-medium">{rv.numero}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">{new Intl.NumberFormat("fr-FR").format(rv.montantTTC)} FCFA</span>
                        <Badge variant={infoRecu?.variante ?? "neutral"}>{infoRecu?.libelle ?? rv.statut}</Badge>
                        {rv.statut === "EMISE" && peutCreerDevis ? <BoutonAnnulerRecuVente recuVenteId={rv.id} /> : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          ) : (
            <p className="text-sm text-muted-foreground">Aucun reçu de vente pour le moment.</p>
          )}

          <h2 className="mt-3 text-sm font-medium text-muted-foreground">Devis</h2>
          {devisListe.length > 0 ? (
            <Card className="p-0">
              <div className="flex flex-col divide-y divide-border">
                {devisListe.map((d) => {
                  const infoDevis = STATUT_DEVIS[d.statut];
                  return (
                    <Link key={d.id} href={`/app/facturation/devis/${d.id}`} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm hover:bg-muted/50">
                      <span className="font-medium">{d.numero}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">{new Intl.NumberFormat("fr-FR").format(d.montantTTC)} FCFA</span>
                        <Badge variant={infoDevis?.variante ?? "neutral"}>{infoDevis?.libelle ?? d.statut}</Badge>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </Card>
          ) : (
            <p className="text-sm text-muted-foreground">Aucun devis pour le moment.</p>
          )}

          <h2 className="mt-3 text-sm font-medium text-muted-foreground">Factures</h2>
          {facturesListe.length > 0 ? (
            <Card className="p-0">
              <div className="flex flex-col divide-y divide-border">
                {facturesListe.map((f) => {
                  const infoFacture = STATUT_FACTURE[f.statut];
                  return (
                    <Link key={f.id} href={`/app/facturation/factures/${f.id}`} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm hover:bg-muted/50">
                      <span className="font-medium">{f.numero}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">{new Intl.NumberFormat("fr-FR").format(f.montantTTC)} FCFA</span>
                        <Badge variant={infoFacture?.variante ?? "neutral"}>{infoFacture?.libelle ?? f.statut}</Badge>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </Card>
          ) : (
            <p className="text-sm text-muted-foreground">Aucune facture pour le moment.</p>
          )}
        </div>

        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-muted-foreground">Historique</h2>
          {historique.length > 0 ? (
            <Card className="lg:sticky lg:top-6">
              <CardContent className="flex flex-col divide-y divide-border p-0">
                {historique.map((h) => {
                  const infoAncien = h.ancienStatut ? STATUT_DEAL[h.ancienStatut] : null;
                  const infoNouveau = STATUT_DEAL[h.nouveauStatut];
                  return (
                    <div key={h.id} className="flex gap-3 px-4 py-3 first:pt-4 last:pb-4">
                      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground">
                        <ArrowRightCircle className="size-3.5" aria-hidden />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-muted-foreground">
                          {new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(h.modifieLe)}
                        </p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-sm">
                          {infoAncien ? (
                            <>
                              <Badge variant={infoAncien.variante}>{infoAncien.libelle}</Badge>
                              <span className="text-muted-foreground">→</span>
                            </>
                          ) : (
                            <span className="text-muted-foreground">Créé —</span>
                          )}
                          <Badge variant={infoNouveau?.variante ?? "neutral"}>{infoNouveau?.libelle ?? h.nouveauStatut}</Badge>
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">par {h.auteur}</p>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          ) : (
            <p className="text-sm text-muted-foreground">Aucune activité pour le moment.</p>
          )}
        </div>
      </div>
    </div>
  );
}
