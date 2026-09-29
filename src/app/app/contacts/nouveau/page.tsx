import { redirect } from "next/navigation";
import { avecEntreprise } from "@/db/client";
import { compteClient } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { listerChampsPersonnalisesContact } from "@/lib/actions/champ-personnalise-contact";
import { FormulaireNouveauContact } from "./formulaire-nouveau-contact";

export default async function PageNouveauContact() {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");

  const [comptes, champsPersonnalises] = await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) =>
    Promise.all([
      tx.select({ id: compteClient.id, nom: compteClient.nom }).from(compteClient),
      listerChampsPersonnalisesContact(utilisateurConnecte.entrepriseId, tx),
    ])
  );

  return (
    <FormulaireNouveauContact
      comptes={comptes}
      champsPersonnalises={champsPersonnalises.map((c) => ({ id: c.id, libelle: c.libelle, type: c.type, obligatoire: c.obligatoire, options: c.options }))}
    />
  );
}
