import { redirect, notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { avecEntreprise } from "@/db/client";
import { facture, ligneFacture, prospect, paiement, entreprise, avoirFacture } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { disponible } from "@/lib/plans";
import { formaterFCFA } from "@/lib/facturation/calcul";
import { Button } from "@/components/ui/button";
import { marquerFacturePayee, annulerFacture } from "@/lib/actions/facture";

const LIBELLE_STATUT: Record<string, string> = {
  EMISE: "Émise",
  PARTIELLEMENT_PAYEE: "Partiellement payée",
  PAYEE: "Payée",
  EN_RETARD: "En retard",
  ANNULEE: "Annulée",
};

export default async function PageDetailFacture({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");

  const donnees = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [f] = await tx.select().from(facture).where(eq(facture.id, id));
    if (!f) return null;

    const [lignes, [p], paiements, [monEntreprise], [avoir]] = await Promise.all([
      tx.select().from(ligneFacture).where(eq(ligneFacture.factureId, id)),
      tx.select().from(prospect).where(eq(prospect.id, f.prospectId)),
      tx.select().from(paiement).where(eq(paiement.factureId, id)),
      tx.select().from(entreprise).where(eq(entreprise.id, utilisateurConnecte.entrepriseId)),
      tx.select().from(avoirFacture).where(eq(avoirFacture.factureId, id)),
    ]);

    return { facture: f, lignes, prospect: p, paiements, entreprise: monEntreprise, avoir: avoir ?? null };
  });

  if (!donnees) notFound();
  const { facture: laFacture, lignes, prospect: leProspect, paiements, entreprise: monEntreprise, avoir } = donnees;

  const peutModifier = peut(utilisateurConnecte.role, "FACTURATION", "MODIFIER");
  const paiementEnLigneDisponible = disponible(monEntreprise, "PAIEMENTS_EN_LIGNE");
  const estReglee = laFacture.statut === "PAYEE" || laFacture.statut === "ANNULEE";

  return (
    <div className="max-w-2xl flex flex-col gap-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{laFacture.numero}</h1>
          <p className="text-muted-foreground">
            {leProspect?.nom}
            {leProspect?.societeCliente ? ` — ${leProspect.societeCliente}` : ""}
          </p>
          {monEntreprise.niu ? <p className="text-xs text-muted-foreground">NIU émetteur : {monEntreprise.niu}</p> : null}
        </div>
        <div className="flex items-center gap-3">
          <span className="rounded-full bg-accent px-2.5 py-1 text-xs font-medium text-accent-foreground">
            {LIBELLE_STATUT[laFacture.statut]}
          </span>
          <Button variant="outline" size="sm" render={<a href={`/app/facturation/factures/${laFacture.id}/pdf`} target="_blank" rel="noopener noreferrer" />} nativeButton={false}>
            Télécharger le PDF
          </Button>
        </div>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="py-2">Désignation</th>
            <th className="py-2 text-right">Qté</th>
            <th className="py-2 text-right">Prix unit.</th>
            <th className="py-2 text-right">TVA</th>
          </tr>
        </thead>
        <tbody>
          {lignes.map((l) => (
            <tr key={l.id} className="border-b">
              <td className="py-2">{l.designation}</td>
              <td className="py-2 text-right">{l.quantite}</td>
              <td className="py-2 text-right">{formaterFCFA(l.prixUnitaire)}</td>
              <td className="py-2 text-right">{l.tauxTVA}%</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="self-end text-right text-sm">
        <p className="text-muted-foreground">HT : {formaterFCFA(laFacture.montantHT)}</p>
        <p className="text-muted-foreground">TVA : {formaterFCFA(laFacture.montantTVA)}</p>
        <p className="text-lg font-medium">TTC : {formaterFCFA(laFacture.montantTTC)}</p>
      </div>

      {avoir ? (
        <p className="text-sm text-destructive">Facture annulée — motif : {avoir.motif}</p>
      ) : null}

      {paiements.length > 0 ? (
        <div>
          <h2 className="mb-2 text-sm font-medium text-muted-foreground">Paiements</h2>
          <ul className="flex flex-col gap-1 text-sm">
            {paiements.map((p) => (
              <li key={p.id}>
                {formaterFCFA(p.montant)} — {p.moyenPaiement}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {peutModifier && !estReglee ? (
        <div className="flex flex-wrap gap-2">
          {paiementEnLigneDisponible ? (
            <p className="text-sm text-muted-foreground">
              Paiement en ligne (Mobile Money) disponible sur votre forfait — intégration NotchPay à finaliser.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Paiement en ligne disponible à partir du forfait Pro — en attendant, pointez le règlement manuellement.
            </p>
          )}
          <form action={marquerFacturePayee.bind(null, laFacture.id)}>
            <Button type="submit">Marquer comme payée</Button>
          </form>
          <form action={annulerFacture.bind(null, laFacture.id, "Annulée depuis la fiche facture")}>
            <Button type="submit" variant="destructive">
              Annuler (avoir)
            </Button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
