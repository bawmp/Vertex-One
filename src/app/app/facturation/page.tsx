import { redirect } from "next/navigation";
import Link from "next/link";
import { inArray, desc, eq } from "drizzle-orm";
import { FileText, Receipt, Repeat } from "lucide-react";
import { avecEntreprise } from "@/db/client";
import { devis, facture, factureRecurrente, deal, contact, compteClient } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { idsVisibles } from "@/lib/portee";
import { formaterFCFA } from "@/lib/facturation/calcul";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { STATUT_DEVIS, STATUT_FACTURE, STATUT_FACTURE_RECURRENTE, FREQUENCE_FACTURE_RECURRENTE } from "@/lib/libelles";
import { DeclencheurRelances } from "./declencheur-relances";

export default async function PageFacturation() {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");

  const { devisVisibles, facturesVisibles, facturesRecurrentesVisibles, nomParDealId } = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    // La portée de Facturation suit celle du Deal (docs/palier-1-*, section
    // 7, adapté à la reconstruction Leads/Contacts/Comptes/Deals du
    // 2026-09-06) — un Devis/une Facture appartient désormais à un Deal, qui
    // porte son propre assigneAId (le "Deal Owner").
    const visibles = await idsVisibles(tx, utilisateurConnecte, "CRM");

    const baseDeals = tx
      .select({ id: deal.id, contactNom: contact.nom, compteNom: compteClient.nom, assigneAId: deal.assigneAId })
      .from(deal)
      .innerJoin(contact, eq(deal.contactId, contact.id))
      .leftJoin(compteClient, eq(deal.compteId, compteClient.id));
    const dealsPertinents = visibles === "TOUT" ? await baseDeals : await baseDeals.where(inArray(deal.assigneAId, visibles));

    const idsDeals = dealsPertinents.map((d) => d.id);
    if (idsDeals.length === 0) return { devisVisibles: [], facturesVisibles: [], facturesRecurrentesVisibles: [], nomParDealId: {} as Record<string, string> };

    const [d, f, fr] = await Promise.all([
      tx.select().from(devis).where(inArray(devis.dealId, idsDeals)).orderBy(desc(devis.creeLe)),
      tx.select().from(facture).where(inArray(facture.dealId, idsDeals)).orderBy(desc(facture.dateEmission)),
      tx.select().from(factureRecurrente).where(inArray(factureRecurrente.dealId, idsDeals)).orderBy(desc(factureRecurrente.creeLe)),
    ]);

    return {
      devisVisibles: d,
      facturesVisibles: f,
      facturesRecurrentesVisibles: fr,
      nomParDealId: Object.fromEntries(dealsPertinents.map((deal_) => [deal_.id, deal_.compteNom ?? deal_.contactNom])),
    };
  });

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Facturation</h1>
      </div>

      {peut(utilisateurConnecte.role, "PARAMETRES", "MODIFIER") ? <DeclencheurRelances /> : null}

      <div>
        <h2 className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <FileText className="size-4" aria-hidden />
          Devis
        </h2>
        <Card className="p-0">
          <div className="flex flex-col divide-y divide-border">
            {devisVisibles.map((d) => {
              const info = STATUT_DEVIS[d.statut];
              return (
                <Link
                  key={d.id}
                  href={`/app/facturation/devis/${d.id}`}
                  className="flex items-center justify-between gap-3 px-4 py-3 text-sm transition-colors hover:bg-muted/60"
                >
                  <span className="min-w-0 truncate">
                    <span className="font-medium">{d.numero}</span>
                    <span className="text-muted-foreground"> — {nomParDealId[d.dealId]}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-3">
                    <span className="tabular-nums text-muted-foreground">{formaterFCFA(d.montantTTC)}</span>
                    <Badge variant={info?.variante ?? "neutral"}>{info?.libelle ?? d.statut}</Badge>
                  </span>
                </Link>
              );
            })}
            {devisVisibles.length === 0 ? <p className="px-4 py-6 text-center text-sm text-muted-foreground">Aucun devis.</p> : null}
          </div>
        </Card>
      </div>

      <div>
        <h2 className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Receipt className="size-4" aria-hidden />
          Factures
        </h2>
        <Card className="p-0">
          <div className="flex flex-col divide-y divide-border">
            {facturesVisibles.map((f) => {
              const info = STATUT_FACTURE[f.statut];
              return (
                <Link
                  key={f.id}
                  href={`/app/facturation/factures/${f.id}`}
                  className="flex items-center justify-between gap-3 px-4 py-3 text-sm transition-colors hover:bg-muted/60"
                >
                  <span className="min-w-0 truncate">
                    <span className="font-medium">{f.numero}</span>
                    <span className="text-muted-foreground"> — {nomParDealId[f.dealId]}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-3">
                    <span className="tabular-nums text-muted-foreground">{formaterFCFA(f.montantTTC)}</span>
                    <Badge variant={info?.variante ?? "neutral"}>{info?.libelle ?? f.statut}</Badge>
                  </span>
                </Link>
              );
            })}
            {facturesVisibles.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">Aucune facture.</p>
            ) : null}
          </div>
        </Card>
      </div>

      <div>
        <h2 className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Repeat className="size-4" aria-hidden />
          Factures récurrentes
        </h2>
        <Card className="p-0">
          <div className="flex flex-col divide-y divide-border">
            {facturesRecurrentesVisibles.map((fr) => {
              const infoStatut = STATUT_FACTURE_RECURRENTE[fr.statut];
              const infoFrequence = FREQUENCE_FACTURE_RECURRENTE[fr.frequence];
              return (
                <Link
                  key={fr.id}
                  href={`/app/deals/${fr.dealId}`}
                  className="flex items-center justify-between gap-3 px-4 py-3 text-sm transition-colors hover:bg-muted/60"
                >
                  <span className="min-w-0 truncate">
                    <span className="font-medium">{fr.libelle}</span>
                    <span className="text-muted-foreground"> — {nomParDealId[fr.dealId]} · {infoFrequence?.libelle ?? fr.frequence}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-3">
                    <span className="tabular-nums text-muted-foreground">{formaterFCFA(fr.montantTTC)}</span>
                    <Badge variant={infoStatut?.variante ?? "neutral"}>{infoStatut?.libelle ?? fr.statut}</Badge>
                  </span>
                </Link>
              );
            })}
            {facturesRecurrentesVisibles.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">Aucune facture récurrente.</p>
            ) : null}
          </div>
        </Card>
      </div>
    </div>
  );
}
