import { redirect, notFound } from "next/navigation";
import { avecEntreprise } from "@/db/client";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { resoudreDonneesClientPage } from "@/lib/facturation/client-document";
import { FormulaireFactureAcompte } from "./formulaire-facture-acompte";

export default async function PageNouvelleFactureAcompte({
  searchParams,
}: {
  searchParams: Promise<{ dealId?: string; contactId?: string }>;
}) {
  const { dealId, contactId } = await searchParams;
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!dealId && !contactId) notFound();

  const donnees = await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) => resoudreDonneesClientPage(tx, { dealId, contactId }));
  if (!donnees) notFound();

  return (
    <div className="max-w-md">
      <h1 className="text-2xl font-semibold tracking-tight">Nouvelle facture d&apos;acompte</h1>
      <p className="mt-1 text-muted-foreground">
        {donnees.dealId ? (
          <>
            Pour le deal <span className="font-medium text-foreground">{donnees.titreDeal}</span> —{" "}
          </>
        ) : (
          "Pour "
        )}
        {donnees.compte?.nom ?? donnees.contact?.nom}. Demande d&apos;avance, à appliquer plus tard sur une vraie facture.
      </p>
      <FormulaireFactureAcompte dealId={donnees.dealId ?? undefined} contactId={donnees.dealId ? undefined : donnees.contactId} />
    </div>
  );
}
