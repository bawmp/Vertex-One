"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { avecEntreprise } from "@/db/client";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { getT } from "@/lib/i18n/langue";
import { alerterParEmail } from "@/lib/notifications/equipe";
import { envoyerEmailInvitation } from "@/lib/invitations/envoi";
import { annulerDemande, confirmerDemande, DUREE_INVITATION_MS, refuserDemande, type Courrier } from "@/lib/rh/demande-collaborateur";

export type EtatDemande = { erreur?: string; message?: string } | null;

function envoyerApres(courriers: Courrier[]) {
  for (const c of courriers) after(() => alerterParEmail([c.to], c.sujet, c.html));
}
function rafraichir() {
  revalidatePath("/app/rh/a-confirmer");
  revalidatePath("/app/rh");
}

/**
 * L'Administrateur confirme la fiche demandée par un Manager (en pouvant corriger les informations) : l'invitation est créée puis envoyée.
 * Droit, entreprise et demande sont revérifiés côté serveur ; aucun salaire ici (saisi sur la fiche, après l'activation du compte).
 */
export async function confirmerDemandeAction(demandeId: string, _etat: EtatDemande, formData: FormData): Promise<EtatDemande> {
  const t = await getT();
  const u = await recupererUtilisateurConnecte();
  if (!u) redirect("/connexion");
  const champ = (k: string) => String(formData.get(k) ?? "");
  const r = await avecEntreprise(u.entrepriseId, (tx) =>
    confirmerDemande(tx, u, String(demandeId), { poste: champ("poste"), typeContrat: champ("typeContrat"), dateEmbauche: champ("dateEmbauche"), dateFin: champ("dateFin"), dateNaissance: champ("dateNaissance") }, champ("responsableId")),
  );
  if (!r.ok) return { erreur: t(r.erreur) };
  envoyerApres(r.courriers);
  const { envoye } = await envoyerEmailInvitation({ entrepriseId: u.entrepriseId, email: r.email, role: "EMPLOYE", jeton: r.jeton, invitantId: u.utilisateurId, dureeHeures: DUREE_INVITATION_MS / 3_600_000 });
  rafraichir();
  return { message: envoye ? t("Fiche confirmée : l'invitation a été envoyée à {email}.", { email: r.email }) : t("Fiche confirmée, mais l'email n'a pas pu partir : transmettez ce lien à la personne : {lien}", { lien: `/invitation/${r.jeton}` }) };
}

export async function refuserDemandeAction(demandeId: string, motif: string): Promise<{ erreur?: string } | null> {
  const t = await getT();
  const u = await recupererUtilisateurConnecte();
  if (!u) redirect("/connexion");
  const r = await avecEntreprise(u.entrepriseId, (tx) => refuserDemande(tx, u, String(demandeId), String(motif ?? "")));
  if (!r.ok) return { erreur: t(r.erreur) };
  envoyerApres(r.courriers);
  rafraichir();
  return null;
}

export async function annulerDemandeAction(demandeId: string): Promise<{ erreur?: string } | null> {
  const t = await getT();
  const u = await recupererUtilisateurConnecte();
  if (!u) redirect("/connexion");
  const r = await avecEntreprise(u.entrepriseId, (tx) => annulerDemande(tx, u, String(demandeId)));
  if (!r.ok) return { erreur: t(r.erreur) };
  rafraichir();
  return null;
}
