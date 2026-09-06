import { redirect } from "next/navigation";
import Link from "next/link";
import { inArray, desc } from "drizzle-orm";
import { FileText, Receipt } from "lucide-react";
import { avecEntreprise } from "@/db/client";
import { devis, facture, prospect } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { idsVisibles } from "@/lib/portee";
import { formaterFCFA } from "@/lib/facturation/calcul";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { STATUT_DEVIS, STATUT_FACTURE } from "@/lib/libelles";
import { DeclencheurRelances } from "./declencheur-relances";

export default async function PageFacturation() {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");

  const { devisVisibles, facturesVisibles, prospectsParId } = await avecEntreprise(
    utilisateurConnecte.entrepriseId,
    async (tx) => {
      // La portée de Facturation suit celle de CRM (même prospect assigné) —
      // filtrer par prospectId visible plutôt que par un assigneAId propre à
      // Devis/Facture, qui n'existe pas dans le modèle (docs/palier-1-*, section 7).
      const visibles = await idsVisibles(tx, utilisateurConnecte, "CRM");

      const prospectsPertinents =
        visibles === "TOUT"
          ? await tx.select().from(prospect)
          : await tx.select().from(prospect).where(inArray(prospect.assigneAId, visibles));

      const idsProspects = prospectsPertinents.map((p) => p.id);
      if (idsProspects.length === 0) return { devisVisibles: [], facturesVisibles: [], prospectsParId: {} };

      const [d, f] = await Promise.all([
        tx.select().from(devis).where(inArray(devis.prospectId, idsProspects)).orderBy(desc(devis.creeLe)),
        tx.select().from(facture).where(inArray(facture.prospectId, idsProspects)).orderBy(desc(facture.dateEmission)),
      ]);

      return {
        devisVisibles: d,
        facturesVisibles: f,
        prospectsParId: Object.fromEntries(prospectsPertinents.map((p) => [p.id, p])),
      };
    }
  );

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
                    <span className="text-muted-foreground"> — {prospectsParId[d.prospectId]?.nom}</span>
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
                    <span className="text-muted-foreground"> — {prospectsParId[f.prospectId]?.nom}</span>
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
    </div>
  );
}
