import { redirect } from "next/navigation";
import { avecEntreprise } from "@/db/client";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { recupererModele, VARIABLES_DISPONIBLES } from "@/lib/email/modeles";
import { FormulaireModeleEmail } from "./formulaire-modele-email";

export default async function PageModelesEmail() {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");

  if (!peut(utilisateurConnecte.role, "PARAMETRES", "MODIFIER")) {
    return <p className="text-muted-foreground">Seul un Administrateur peut modifier ces modèles.</p>;
  }

  const [modeleDevis, modeleFacture] = await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) =>
    Promise.all([
      recupererModele(tx, utilisateurConnecte.entrepriseId, "ENVOI_DEVIS"),
      recupererModele(tx, utilisateurConnecte.entrepriseId, "ENVOI_FACTURE"),
    ])
  );

  return (
    <div className="max-w-2xl flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Modèles d&apos;email</h1>
        <p className="mt-1 text-muted-foreground">
          Personnalisez le texte envoyé au client lorsqu&apos;un devis ou une facture lui est transmis par email. Le
          PDF du document est toujours joint automatiquement.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          Variables disponibles :
          {VARIABLES_DISPONIBLES.map((v) => (
            <code
              key={v.cle}
              title={v.description}
              className="rounded-md bg-accent px-1.5 py-0.5 font-mono text-accent-foreground"
            >
              {`{{${v.cle}}}`}
            </code>
          ))}
        </div>
      </div>

      <FormulaireModeleEmail type="ENVOI_DEVIS" titre="Envoi d'un devis" objet={modeleDevis.objet} corps={modeleDevis.corps} />
      <FormulaireModeleEmail
        type="ENVOI_FACTURE"
        titre="Envoi d'une facture"
        objet={modeleFacture.objet}
        corps={modeleFacture.corps}
      />
    </div>
  );
}
