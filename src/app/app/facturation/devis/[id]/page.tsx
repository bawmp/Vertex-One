import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { avecEntreprise } from "@/db/client";
import { devis, ligneDevis, prospect, facture } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { formaterFCFA } from "@/lib/facturation/calcul";
import { Button } from "@/components/ui/button";
import { envoyerDevis, accepterDevis } from "@/lib/actions/devis";

const LIBELLE_STATUT: Record<string, string> = {
  BROUILLON: "Brouillon",
  ENVOYE: "Envoyé",
  ACCEPTE: "Accepté",
  REFUSE: "Refusé",
  EXPIRE: "Expiré",
};

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

  return (
    <div className="max-w-2xl flex flex-col gap-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{leDevis.numero}</h1>
          <p className="text-muted-foreground">
            {leProspect?.nom}
            {leProspect?.societeCliente ? ` — ${leProspect.societeCliente}` : ""}
          </p>
        </div>
        <span className="rounded-full bg-accent px-2.5 py-1 text-xs font-medium text-accent-foreground">
          {LIBELLE_STATUT[leDevis.statut]}
        </span>
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
        <p className="text-muted-foreground">HT : {formaterFCFA(leDevis.montantHT)}</p>
        <p className="text-muted-foreground">TVA : {formaterFCFA(leDevis.montantTVA)}</p>
        <p className="text-lg font-medium">TTC : {formaterFCFA(leDevis.montantTTC)}</p>
      </div>

      {laFacture ? (
        <Link href={`/app/facturation/factures/${laFacture.id}`} className="text-primary underline underline-offset-4">
          Voir la facture {laFacture.numero}
        </Link>
      ) : peutModifier ? (
        <div className="flex gap-2">
          {leDevis.statut === "BROUILLON" ? (
            <form action={envoyerDevis.bind(null, leDevis.id)}>
              <Button type="submit">Envoyer au client</Button>
            </form>
          ) : null}
          {leDevis.statut === "ENVOYE" ? (
            <form action={accepterDevis.bind(null, leDevis.id)}>
              <Button type="submit">Marquer accepté → générer la facture</Button>
            </form>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
