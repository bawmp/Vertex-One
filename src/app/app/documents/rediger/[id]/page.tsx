import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { avecEntreprise } from "@/db/client";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { documentRedigeAutorise, lireDocument } from "@/lib/redaction/service";
import { chargerIdentite } from "@/lib/redaction/identite";
import { EditeurDocument } from "../editeur-document";

export default async function PageEditeurDocument({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");

  const donnees = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const d = await documentRedigeAutorise(tx, utilisateurConnecte, id, "VOIR");
    if (!d) return null;
    const identite = await chargerIdentite(tx, utilisateurConnecte.entrepriseId);
    const modifiable = (await documentRedigeAutorise(tx, utilisateurConnecte, id, "MODIFIER")) !== null;
    return { d, identite, modifiable };
  });
  if (!donnees) notFound();

  const { contenu, miseEnPage } = lireDocument(donnees.d);
  const { identite } = donnees;

  return (
    <div className="flex flex-col gap-4">
      <Link href="/app/documents/rediger" className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Mes documents rédigés
      </Link>
      <EditeurDocument
        id={donnees.d.id}
        titreInitial={donnees.d.titre}
        contenuInitial={contenu}
        miseEnPageInitiale={miseEnPage}
        identite={{ nom: identite.nom, groupeNom: identite.groupeNom, adresse: identite.adresse, ville: identite.ville, niu: identite.niu, rccm: identite.rccm, couleur: identite.couleur, aLogo: !!identite.logo }}
        peutModifier={donnees.modifiable}
        peutCreer={peut(utilisateurConnecte, "DOCUMENTS", "CREER")}
      />
    </div>
  );
}
