import { redirect, notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { avecEntreprise } from "@/db/client";
import { prospect } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { FormulaireDevis } from "./formulaire-devis";

export default async function PageNouveauDevis({
  searchParams,
}: {
  searchParams: Promise<{ prospectId?: string }>;
}) {
  const { prospectId } = await searchParams;
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!prospectId) notFound();

  const [leProspect] = await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) =>
    tx.select().from(prospect).where(eq(prospect.id, prospectId))
  );
  if (!leProspect) notFound();

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-semibold tracking-tight">Nouveau devis</h1>
      <p className="mt-1 text-muted-foreground">
        Pour <span className="font-medium text-foreground">{leProspect.nom}</span>
        {leProspect.societeCliente ? ` — ${leProspect.societeCliente}` : ""}.
      </p>
      <FormulaireDevis prospectId={leProspect.id} />
    </div>
  );
}
