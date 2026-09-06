import { redirect } from "next/navigation";
import { avecEntreprise } from "@/db/client";
import { contact, compteClient } from "@/db/schema";
import { eq } from "drizzle-orm";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { FormulaireNouveauDeal } from "./formulaire-nouveau-deal";

export default async function PageNouveauDeal({ searchParams }: { searchParams: Promise<{ contactId?: string }> }) {
  const { contactId } = await searchParams;
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");

  const contacts = await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) =>
    tx
      .select({ id: contact.id, nom: contact.nom, compteNom: compteClient.nom })
      .from(contact)
      .leftJoin(compteClient, eq(contact.compteId, compteClient.id))
  );

  return <FormulaireNouveauDeal contacts={contacts} contactIdPreselectionne={contactId} />;
}
