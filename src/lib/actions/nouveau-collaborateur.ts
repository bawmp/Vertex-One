"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { avecEntreprise } from "@/db/client";
import { entreprise, utilisateur } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { disponible } from "@/lib/plans";
import { envoyerEmailInvitation } from "@/lib/invitations/envoi";
import { validerNouveauCollaborateur } from "@/lib/rh/nouveau-collaborateur";
import { getT } from "@/lib/i18n/langue";
import { alerterParEmail } from "@/lib/notifications/equipe";
import { creerInvitationCollaborateur, deposerDemande, DUREE_INVITATION_MS } from "@/lib/rh/demande-collaborateur";

export type EtatNouveauCollaborateur = { erreur?: string; succes?: string } | null;

const aujourdhuiDouala = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Douala" }).format(new Date());

/**
 * Crée la fiche d'un collaborateur (employé, stagiaire professionnel, prestataire ou freelance). **L'Administrateur** l'invite directement par email :
 * la fiche se remplit à l'activation du compte avec ce qui est saisi ici. **Un Manager** (droit RH/CREER) dépose une DEMANDE que l'Administrateur
 * doit confirmer (2026-11-22) : tant qu'elle ne l'est pas, aucune invitation ne part et rien n'est créé. Le rôle est toujours Employé, un Manager en
 * est d'office le responsable, et **aucun salaire** n'est saisi ici — la rémunération est réservée à l'Administrateur, depuis la fiche. Rien du
 * rôle ni de l'entreprise ne vient du navigateur.
 */
export async function inviterCollaborateur(_etat: EtatNouveauCollaborateur, formData: FormData): Promise<EtatNouveauCollaborateur> {
  const t = await getT();
  const u = await recupererUtilisateurConnecte();
  if (!u) redirect("/connexion");
  if ((u.role !== "ADMIN" && u.role !== "MANAGER") || !peut(u, "RH", "CREER")) return { erreur: t("Vous n'avez pas le droit de créer la fiche d'un collaborateur.") };

  const champ = (k: string) => String(formData.get(k) ?? "");
  const v = validerNouveauCollaborateur({ email: champ("email"), poste: champ("poste"), typeContrat: champ("typeContrat"), dateEmbauche: champ("dateEmbauche"), dateFin: champ("dateFin"), dateNaissance: champ("dateNaissance") }, aujourdhuiDouala());
  if (!v.ok) return { erreur: t(v.erreur) };
  const { email } = v.valeurs;

  if (u.role === "MANAGER") {
    const d = await avecEntreprise(u.entrepriseId, (tx) => deposerDemande(tx, u, { email: champ("email"), poste: champ("poste"), typeContrat: champ("typeContrat"), dateEmbauche: champ("dateEmbauche"), dateFin: champ("dateFin"), dateNaissance: champ("dateNaissance") }));
    if (!d.ok) return { erreur: t(d.erreur) };
    // L'Administrateur est prévenu APRÈS la réponse : le Manager n'attend jamais l'envoi.
    for (const c of d.courriers) after(() => alerterParEmail([c.to], c.sujet, c.html));
    revalidatePath("/app/rh");
    revalidatePath("/app/rh/a-confirmer");
    return { succes: t("Demande envoyée à l'Administrateur : la personne sera invitée dès qu'il aura confirmé la fiche. Son salaire sera renseigné par l'Administrateur.") };
  }

  let responsableId: string | undefined;
  let jeton = "";
  const demande = champ("responsableId");

  const r = await avecEntreprise(u.entrepriseId, async (tx) => {
    const [e] = await tx.select({ planAbonnement: entreprise.planAbonnement, statutAbonnement: entreprise.statutAbonnement }).from(entreprise).where(eq(entreprise.id, u.entrepriseId));
    if (!e || !disponible(e, "RH")) return { erreur: t("Votre abonnement est suspendu : renouvelez-le pour accéder à cette fonctionnalité.") };
    if (demande) {
      // `utilisateur` est en RLS permissive : le filtre sur l'entreprise est explicite.
      const [resp] = await tx.select({ id: utilisateur.id }).from(utilisateur).where(and(eq(utilisateur.id, demande), eq(utilisateur.entrepriseId, u.entrepriseId)));
      if (!resp) return { erreur: t("Responsable introuvable.") };
      responsableId = resp.id;
    }
    const inv = await creerInvitationCollaborateur(tx, u.entrepriseId, v.valeurs, responsableId);
    if (!inv.ok) return { erreur: t(inv.erreur) };
    jeton = inv.jeton;
    return null;
  });
  if (r?.erreur) return { erreur: t(r.erreur) };

  const { envoye } = await envoyerEmailInvitation({ entrepriseId: u.entrepriseId, email, role: "EMPLOYE", jeton, invitantId: u.utilisateurId, dureeHeures: DUREE_INVITATION_MS / 3_600_000 });
  revalidatePath("/app/rh");
  return { succes: envoye ? t("Invitation envoyée par email à {email}. La fiche se crée dès qu'il active son compte depuis le lien reçu.", { email }) : t("Invitation créée, mais l'email n'a pas pu partir : transmettez ce lien à la personne : {lien}", { lien: `/invitation/${jeton}` }) };
}
