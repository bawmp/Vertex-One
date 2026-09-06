import { redirect } from "next/navigation";
import { avecEntreprise } from "@/db/client";
import { compteClient } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { FormulaireNouveauContact } from "./formulaire-nouveau-contact";

export default async function PageNouveauContact() {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");

  const comptes = await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) => tx.select({ id: compteClient.id, nom: compteClient.nom }).from(compteClient));

  return <FormulaireNouveauContact comptes={comptes} />;
}
