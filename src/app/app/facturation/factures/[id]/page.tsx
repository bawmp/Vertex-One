import { redirect, notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { Download, CheckCircle2, XCircle, CreditCard } from "lucide-react";
import { avecEntreprise } from "@/db/client";
import { facture, ligneFacture, contact, compteClient, paiement, entreprise, avoirFacture } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { disponible } from "@/lib/plans";
import { formaterFCFA } from "@/lib/facturation/calcul";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { STATUT_FACTURE } from "@/lib/libelles";
import { marquerFacturePayee, annulerFacture } from "@/lib/actions/facture";
import { FormulaireEnvoiFacture } from "./formulaire-envoi-facture";

export default async function PageDetailFacture({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");

  const donnees = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [f] = await tx.select().from(facture).where(eq(facture.id, id));
    if (!f) return null;

    const [lignes, paiements, [monEntreprise], [avoir]] = await Promise.all([
      tx.select().from(ligneFacture).where(eq(ligneFacture.factureId, id)),
      tx.select().from(paiement).where(eq(paiement.factureId, id)),
      tx.select().from(entreprise).where(eq(entreprise.id, utilisateurConnecte.entrepriseId)),
      tx.select().from(avoirFacture).where(eq(avoirFacture.factureId, id)),
    ]);
    const [p] = f.contactId ? await tx.select().from(contact).where(eq(contact.id, f.contactId)) : [null];
    const [compte] = f.compteId ? await tx.select().from(compteClient).where(eq(compteClient.id, f.compteId)) : [null];

    return { facture: f, lignes, prospect: p, compte, paiements, entreprise: monEntreprise, avoir: avoir ?? null };
  });

  if (!donnees) notFound();
  const { facture: laFacture, lignes, prospect: leProspect, compte: leCompte, paiements, entreprise: monEntreprise, avoir } = donnees;

  const peutModifier = peut(utilisateurConnecte.role, "FACTURATION", "MODIFIER");
  const paiementEnLigneDisponible = disponible(monEntreprise, "PAIEMENTS_EN_LIGNE");
  const estReglee = laFacture.statut === "PAYEE" || laFacture.statut === "ANNULEE";
  const info = STATUT_FACTURE[laFacture.statut];

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-semibold tracking-tight">{laFacture.numero}</h1>
            <Badge variant={info?.variante ?? "neutral"}>{info?.libelle ?? laFacture.statut}</Badge>
          </div>
          <p className="text-muted-foreground">
            {leProspect?.nom}
            {leCompte ? ` — ${leCompte.nom}` : ""}
          </p>
          {monEntreprise.niu ? <p className="text-xs text-muted-foreground">NIU émetteur : {monEntreprise.niu}</p> : null}
        </div>
        <Button
          variant="outline"
          size="sm"
          render={<a href={`/app/facturation/factures/${laFacture.id}/pdf`} target="_blank" rel="noopener noreferrer" />}
          nativeButton={false}
        >
          <Download data-icon="inline-start" aria-hidden />
          Télécharger le PDF
        </Button>
      </div>

      {peutModifier ? (
        <FormulaireEnvoiFacture
          factureId={laFacture.id}
          peutPersonnaliserModele={peut(utilisateurConnecte.role, "PARAMETRES", "MODIFIER")}
        />
      ) : null}

      <Card className="p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-muted-foreground">
              <th className="px-4 py-2.5 font-medium">Désignation</th>
              <th className="px-4 py-2.5 text-right font-medium">Qté</th>
              <th className="px-4 py-2.5 text-right font-medium">Prix unit.</th>
              <th className="px-4 py-2.5 text-right font-medium">TVA</th>
            </tr>
          </thead>
          <tbody>
            {lignes.map((l) => (
              <tr key={l.id} className="border-b last:border-0">
                <td className="px-4 py-2.5">{l.designation}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{l.quantite}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{formaterFCFA(l.prixUnitaire)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{l.tauxTVA}%</td>
              </tr>
            ))}
          </tbody>
        </table>
        <CardContent className="flex flex-col items-end gap-1 border-t bg-muted/20 py-3 text-sm">
          <p className="text-muted-foreground">
            HT : <span className="tabular-nums text-foreground">{formaterFCFA(laFacture.montantHT)}</span>
          </p>
          <p className="text-muted-foreground">
            TVA : <span className="tabular-nums text-foreground">{formaterFCFA(laFacture.montantTVA)}</span>
          </p>
          <p className="text-lg font-medium">TTC : <span className="tabular-nums">{formaterFCFA(laFacture.montantTTC)}</span></p>
        </CardContent>
      </Card>

      {avoir ? (
        <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <XCircle className="size-4 shrink-0" aria-hidden />
          Facture annulée — motif : {avoir.motif}
        </div>
      ) : null}

      {paiements.length > 0 ? (
        <div>
          <h2 className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <CreditCard className="size-4" aria-hidden />
            Paiements
          </h2>
          <Card className="p-0">
            <div className="flex flex-col divide-y divide-border">
              {paiements.map((p) => (
                <div key={p.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <span className="tabular-nums font-medium">{formaterFCFA(p.montant)}</span>
                  <Badge variant="success">{p.moyenPaiement}</Badge>
                </div>
              ))}
            </div>
          </Card>
        </div>
      ) : null}

      {peutModifier && !estReglee ? (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed p-4">
          {paiementEnLigneDisponible ? (
            <p className="text-sm text-muted-foreground">
              Paiement en ligne (Mobile Money) disponible sur votre forfait — intégration NotchPay à finaliser.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Paiement en ligne disponible à partir du forfait Pro — en attendant, pointez le règlement manuellement.
            </p>
          )}
          <div className="flex gap-2">
            <form action={marquerFacturePayee.bind(null, laFacture.id)}>
              <Button type="submit">
                <CheckCircle2 data-icon="inline-start" aria-hidden />
                Marquer comme payée
              </Button>
            </form>
            <form action={annulerFacture.bind(null, laFacture.id, "Annulée depuis la fiche facture")}>
              <Button type="submit" variant="destructive">
                Annuler (avoir)
              </Button>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
