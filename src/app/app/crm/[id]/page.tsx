import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { eq, desc } from "drizzle-orm";
import { avecEntreprise } from "@/db/client";
import { prospect, interaction } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { idsVisibles } from "@/lib/portee";
import { Button } from "@/components/ui/button";
import { FormulaireInteraction } from "./formulaire-interaction";
import { ChangeurStatut } from "./changeur-statut";

export default async function PageFicheProspect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");

  const { fiche, historique } = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const visibles = await idsVisibles(tx, utilisateurConnecte, "CRM");

    const [ligne] = await tx.select().from(prospect).where(eq(prospect.id, id));
    if (!ligne) return { fiche: null, historique: [] };
    if (visibles !== "TOUT" && !visibles.includes(ligne.assigneAId)) return { fiche: null, historique: [] };

    const historiqueLignes = await tx
      .select()
      .from(interaction)
      .where(eq(interaction.prospectId, id))
      .orderBy(desc(interaction.creeLe));

    return { fiche: ligne, historique: historiqueLignes };
  });

  if (!fiche) notFound();

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{fiche.nom}</h1>
          {fiche.societeCliente ? <p className="text-muted-foreground">{fiche.societeCliente}</p> : null}
          <p className="text-sm text-muted-foreground">
            {fiche.telephone}
            {fiche.email ? ` — ${fiche.email}` : ""}
          </p>
        </div>
        {peut(utilisateurConnecte.role, "FACTURATION", "CREER") ? (
          <Button render={<Link href={`/app/facturation/devis/nouveau?prospectId=${fiche.id}`} />} nativeButton={false}>
            Créer un devis
          </Button>
        ) : null}
      </div>

      {peut(utilisateurConnecte.role, "CRM", "MODIFIER") ? <ChangeurStatut prospectId={fiche.id} statutActuel={fiche.statut} /> : null}

      <div>
        <h2 className="mb-2 text-sm font-medium text-muted-foreground">Historique</h2>
        <ul className="flex flex-col gap-2">
          {historique.map((h) => (
            <li key={h.id} className="rounded-md border p-3 text-sm">
              <p className="text-xs font-medium uppercase text-muted-foreground">{h.type}</p>
              <p>{h.contenu}</p>
            </li>
          ))}
          {historique.length === 0 ? <p className="text-sm text-muted-foreground">Aucune interaction pour le moment.</p> : null}
        </ul>
      </div>

      {peut(utilisateurConnecte.role, "CRM", "MODIFIER") ? <FormulaireInteraction prospectId={fiche.id} /> : null}
    </div>
  );
}
