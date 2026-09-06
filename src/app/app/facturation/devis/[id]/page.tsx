import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { Download, ArrowRight } from "lucide-react";
import { avecEntreprise } from "@/db/client";
import { devis, ligneDevis, prospect, facture } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { formaterFCFA } from "@/lib/facturation/calcul";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { STATUT_DEVIS } from "@/lib/libelles";
import { accepterDevis } from "@/lib/actions/devis";
import { FormulaireEnvoiDevis } from "./formulaire-envoi-devis";

export default async function PageDetailDevis({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");

  const donnees = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [d] = await tx.select().from(devis).where(eq(devis.id, id));
    if (!d) return null;

    const [l, [p], [f]] = await Promise.all([
      tx.select().from(ligneDevis).where(eq(ligneDevis.devisId, id)),
      tx.select().from(prospect).where(eq(prospect.id, d.prospectId)),
      tx.select().from(facture).where(eq(facture.devisOrigineId, id)),
    ]);

    return { leDevis: d, lignes: l, leProspect: p, laFacture: f ?? null };
  });

  if (!donnees) notFound();
  const { leDevis, lignes, leProspect, laFacture } = donnees;

  const peutModifier = peut(utilisateurConnecte.role, "FACTURATION", "MODIFIER");
  const info = STATUT_DEVIS[leDevis.statut];

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-semibold tracking-tight">{leDevis.numero}</h1>
            <Badge variant={info?.variante ?? "neutral"}>{info?.libelle ?? leDevis.statut}</Badge>
          </div>
          <p className="text-muted-foreground">
            {leProspect?.nom}
            {leProspect?.societeCliente ? ` — ${leProspect.societeCliente}` : ""}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          render={<a href={`/app/facturation/devis/${leDevis.id}/pdf`} target="_blank" rel="noopener noreferrer" />}
          nativeButton={false}
        >
          <Download data-icon="inline-start" aria-hidden />
          Télécharger le PDF
        </Button>
      </div>

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
            HT : <span className="tabular-nums text-foreground">{formaterFCFA(leDevis.montantHT)}</span>
          </p>
          <p className="text-muted-foreground">
            TVA : <span className="tabular-nums text-foreground">{formaterFCFA(leDevis.montantTVA)}</span>
          </p>
          <p className="text-lg font-medium">TTC : <span className="tabular-nums">{formaterFCFA(leDevis.montantTTC)}</span></p>
        </CardContent>
      </Card>

      {laFacture ? (
        <Link
          href={`/app/facturation/factures/${laFacture.id}`}
          className="flex w-fit items-center gap-1.5 text-primary underline-offset-4 hover:underline"
        >
          Voir la facture {laFacture.numero}
          <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      ) : peutModifier ? (
        <div className="flex gap-2">
          {leDevis.statut === "BROUILLON" ? (
            <FormulaireEnvoiDevis
              devisId={leDevis.id}
              peutPersonnaliserModele={peut(utilisateurConnecte.role, "PARAMETRES", "MODIFIER")}
            />
          ) : null}
          {leDevis.statut === "ENVOYE" ? (
            <form action={accepterDevis.bind(null, leDevis.id)}>
              <Button type="submit">
                Marquer accepté
                <ArrowRight data-icon="inline-end" aria-hidden />
              </Button>
            </form>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
