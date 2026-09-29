import { redirect } from "next/navigation";
import { avecEntreprise } from "@/db/client";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { listerChampsPersonnalisesContact } from "@/lib/actions/champ-personnalise-contact";
import { getT } from "@/lib/i18n/langue";
import { GestionChampsContact } from "./gestion-champs-contact";

export default async function PageChampsContact() {
  const t = await getT();
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");

  if (!peut(utilisateurConnecte, "PARAMETRES", "MODIFIER")) {
    return <p className="text-muted-foreground">{t("Vous n'avez pas accès aux Paramètres.")}</p>;
  }

  const champs = await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) => listerChampsPersonnalisesContact(utilisateurConnecte.entrepriseId, tx));

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("Champs personnalisés (Contact)")}</h1>
        <p className="text-muted-foreground">
          {t("Ajoutez vos propres champs à la fiche Contact — ils apparaissent pour tous vos collaborateurs, propres à votre entreprise.")}
        </p>
      </div>

      <div className="animate-in fade-in slide-in-from-bottom-2 duration-500 fill-mode-both">
        <GestionChampsContact
          champs={champs.map((c) => ({
            id: c.id,
            libelle: c.libelle,
            type: c.type,
            obligatoire: c.obligatoire,
            options: c.options ?? undefined,
          }))}
        />
      </div>
    </div>
  );
}
