import { redirect } from "next/navigation";
import Link from "next/link";
import { inArray, desc } from "drizzle-orm";
import { avecEntreprise } from "@/db/client";
import { devis, facture, prospect } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { idsVisibles } from "@/lib/portee";
import { formaterFCFA } from "@/lib/facturation/calcul";

const LIBELLE_STATUT_DEVIS: Record<string, string> = {
  BROUILLON: "Brouillon",
  ENVOYE: "Envoyé",
  ACCEPTE: "Accepté",
  REFUSE: "Refusé",
  EXPIRE: "Expiré",
};

const LIBELLE_STATUT_FACTURE: Record<string, string> = {
  EMISE: "Émise",
  PARTIELLEMENT_PAYEE: "Partiellement payée",
  PAYEE: "Payée",
  EN_RETARD: "En retard",
  ANNULEE: "Annulée",
};

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

      <div>
        <h2 className="mb-2 text-sm font-medium text-muted-foreground">Devis</h2>
        <div className="flex flex-col gap-2">
          {devisVisibles.map((d) => (
            <Link
              key={d.id}
              href={`/app/facturation/devis/${d.id}`}
              className="flex items-center justify-between rounded-md border p-3 text-sm hover:bg-muted"
            >
              <span>
                {d.numero} — {prospectsParId[d.prospectId]?.nom}
              </span>
              <span className="flex items-center gap-3">
                <span className="text-muted-foreground">{formaterFCFA(d.montantTTC)}</span>
                <span className="rounded-full bg-accent px-2 py-0.5 text-xs text-accent-foreground">
                  {LIBELLE_STATUT_DEVIS[d.statut]}
                </span>
              </span>
            </Link>
          ))}
          {devisVisibles.length === 0 ? <p className="text-sm text-muted-foreground">Aucun devis.</p> : null}
        </div>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-medium text-muted-foreground">Factures</h2>
        <div className="flex flex-col gap-2">
          {facturesVisibles.map((f) => (
            <Link
              key={f.id}
              href={`/app/facturation/factures/${f.id}`}
              className="flex items-center justify-between rounded-md border p-3 text-sm hover:bg-muted"
            >
              <span>
                {f.numero} — {prospectsParId[f.prospectId]?.nom}
              </span>
              <span className="flex items-center gap-3">
                <span className="text-muted-foreground">{formaterFCFA(f.montantTTC)}</span>
                <span className="rounded-full bg-accent px-2 py-0.5 text-xs text-accent-foreground">
                  {LIBELLE_STATUT_FACTURE[f.statut]}
                </span>
              </span>
            </Link>
          ))}
          {facturesVisibles.length === 0 ? <p className="text-sm text-muted-foreground">Aucune facture.</p> : null}
        </div>
      </div>
    </div>
  );
}
