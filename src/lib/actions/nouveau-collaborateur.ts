"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { generateRandomString } from "better-auth/crypto";
import { avecEntreprise } from "@/db/client";
import { entreprise, invitation, utilisateur } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { disponible } from "@/lib/plans";
import { envoyerEmailInvitation } from "@/lib/invitations/envoi";
import { validerNouveauCollaborateur } from "@/lib/rh/nouveau-collaborateur";
import { getT } from "@/lib/i18n/langue";

export type EtatNouveauCollaborateur = { erreur?: string; succes?: string } | null;

const DUREE_INVITATION_MS = 72 * 60 * 60 * 1000;
const aujourdhuiDouala = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Douala" }).format(new Date());

/**
 * Crée la fiche d'un collaborateur (employé, stagiaire professionnel, prestataire ou freelance) en l'invitant par email : la fiche se
 * remplit à l'activation du compte avec ce qui est saisi ici. Ouvert à l'Administrateur ET aux Managers (droit RH/CREER), mais borné :
 * le rôle est toujours Employé (jamais un Manager ni un Administrateur), un Manager en est d'office le responsable, et **aucun salaire**
 * n'est saisi ici — la rémunération est réservée à l'Administrateur, depuis la fiche. Rien du rôle ni de l'entreprise ne vient du navigateur.
 */
export async function inviterCollaborateur(_etat: EtatNouveauCollaborateur, formData: FormData): Promise<EtatNouveauCollaborateur> {
  const t = await getT();
  const u = await recupererUtilisateurConnecte();
  if (!u) redirect("/connexion");
  if ((u.role !== "ADMIN" && u.role !== "MANAGER") || !peut(u, "RH", "CREER")) return { erreur: t("Vous n'avez pas le droit de créer la fiche d'un collaborateur.") };

  const champ = (k: string) => String(formData.get(k) ?? "");
  const v = validerNouveauCollaborateur({ email: champ("email"), poste: champ("poste"), typeContrat: champ("typeContrat"), dateEmbauche: champ("dateEmbauche"), dateFin: champ("dateFin"), dateNaissance: champ("dateNaissance") }, aujourdhuiDouala());
  if (!v.ok) return { erreur: t(v.erreur) };
  const { email, poste, typeContrat, dateEmbauche, dateFin, dateNaissance } = v.valeurs;

  const jeton = generateRandomString(32, "a-z", "A-Z", "0-9");
  let responsableId: string | undefined = u.role === "MANAGER" ? u.utilisateurId : undefined;
  const demande = champ("responsableId");

  const r = await avecEntreprise(u.entrepriseId, async (tx) => {
    const [e] = await tx.select({ planAbonnement: entreprise.planAbonnement, statutAbonnement: entreprise.statutAbonnement }).from(entreprise).where(eq(entreprise.id, u.entrepriseId));
    if (!e || !disponible(e, "RH")) return { erreur: t("Votre abonnement est suspendu : renouvelez-le pour accéder à cette fonctionnalité.") };
    if (u.role === "ADMIN" && demande) {
      // `utilisateur` est en RLS permissive : le filtre sur l'entreprise est explicite.
      const [resp] = await tx.select({ id: utilisateur.id }).from(utilisateur).where(and(eq(utilisateur.id, demande), eq(utilisateur.entrepriseId, u.entrepriseId)));
      if (!resp) return { erreur: t("Responsable introuvable.") };
      responsableId = resp.id;
    }
    // Comparaison sans tenir compte de la casse : l'adresse est unique sur toute la plateforme.
    const [dejaCompte] = await tx.select({ id: utilisateur.id }).from(utilisateur).where(sql`lower(${utilisateur.email}) = ${email}`);
    if (dejaCompte) return { erreur: t("Cette adresse email a déjà un compte.") };
    await tx.insert(invitation).values({
      entrepriseId: u.entrepriseId,
      email,
      roleProposee: "EMPLOYE",
      postePropose: poste,
      typeContratPropose: typeContrat,
      dateEmbauchePropose: new Date(`${dateEmbauche}T00:00:00`),
      dateFinPropose: dateFin ? new Date(`${dateFin}T00:00:00`) : undefined,
      dateNaissancePropose: dateNaissance ?? undefined,
      managerPropose: responsableId,
      jeton,
      expireLe: new Date(Date.now() + DUREE_INVITATION_MS),
    });
    return null;
  });
  if (r?.erreur) return { erreur: t(r.erreur) };

  const { envoye } = await envoyerEmailInvitation({ entrepriseId: u.entrepriseId, email, role: "EMPLOYE", jeton, invitantId: u.utilisateurId, dureeHeures: DUREE_INVITATION_MS / 3_600_000 });
  revalidatePath("/app/rh");
  return { succes: envoye ? t("Invitation envoyée par email à {email}. La fiche se crée dès qu'il active son compte depuis le lien reçu.", { email }) : t("Invitation créée, mais l'email n'a pas pu partir : transmettez ce lien à la personne : {lien}", { lien: `/invitation/${jeton}` }) };
}
