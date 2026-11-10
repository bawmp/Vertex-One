"use server";

import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { avecEntreprise } from "@/db/client";
import { entreprise, rapportHierarchique, utilisateur } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { disponible } from "@/lib/plans";
import { destinatairesPossibles } from "@/lib/rh/rapport-hierarchique";
import { LONGUEUR_MAX_CONTENU, LONGUEUR_MAX_OBJET } from "@/lib/rh/rapport-hierarchique-regles";
import { alerterParEmail, echapper } from "@/lib/notifications/equipe";
import { getT } from "@/lib/i18n/langue";
import { m } from "@/lib/i18n/catalogue";

const CHEMIN = "/app/rh/rapports-ecrits";

export type EtatRapport = { erreur?: string; envoye?: boolean } | null;

const schemaRapport = z.object({
  destinataireId: z.string().min(1, m("Choisissez le destinataire.")),
  objet: z.string().trim().min(1, m("L'objet est requis.")).max(LONGUEUR_MAX_OBJET, m("L'objet est trop long.")),
  contenu: z.string().trim().min(1, m("Le rapport ne peut pas être vide.")).max(LONGUEUR_MAX_CONTENU, m("Le rapport est trop long.")),
});

/**
 * Envoie un rapport écrit à un supérieur. Le destinataire est relu en base et doit figurer parmi les personnes que le rôle de l'auteur
 * autorise (Employé → un Manager ; Manager → son supérieur ou un Administrateur) ; l'auteur et l'entreprise viennent de la session.
 * L'email d'alerte part APRÈS la réponse (after()) et ne contient pas le texte du rapport.
 */
export async function envoyerRapportHierarchique(_etat: EtatRapport, formData: FormData): Promise<EtatRapport> {
  const t = await getT();
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte, "RH", "CREER")) return { erreur: t("Vous n'avez pas le droit d'envoyer un rapport.") };

  const analyse = schemaRapport.safeParse({ destinataireId: formData.get("destinataireId"), objet: formData.get("objet"), contenu: formData.get("contenu") });
  if (!analyse.success) return { erreur: t(analyse.error.issues[0]?.message ?? m("Formulaire invalide.")) };
  const { destinataireId, objet, contenu } = analyse.data;

  const resultat = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [monEntreprise] = await tx
      .select({ nom: entreprise.nom, planAbonnement: entreprise.planAbonnement, statutAbonnement: entreprise.statutAbonnement })
      .from(entreprise)
      .where(eq(entreprise.id, utilisateurConnecte.entrepriseId));
    if (!disponible(monEntreprise, "RH")) return { erreur: t("Les Ressources Humaines sont disponibles à partir du forfait Business.") };

    const autorises = await destinatairesPossibles(tx, utilisateurConnecte);
    const destinataire = autorises.find((p) => p.id === destinataireId);
    if (!destinataire) return { erreur: t("Vous ne pouvez pas envoyer de rapport à cette personne.") };

    const [moi] = await tx
      .select({ nomComplet: utilisateur.nomComplet })
      .from(utilisateur)
      .where(and(eq(utilisateur.id, utilisateurConnecte.utilisateurId), eq(utilisateur.entrepriseId, utilisateurConnecte.entrepriseId)));
    const [cible] = await tx
      .select({ email: utilisateur.email })
      .from(utilisateur)
      .where(and(eq(utilisateur.id, destinataire.id), eq(utilisateur.entrepriseId, utilisateurConnecte.entrepriseId)));

    const [cree] = await tx
      .insert(rapportHierarchique)
      .values({ entrepriseId: utilisateurConnecte.entrepriseId, auteurId: utilisateurConnecte.utilisateurId, destinataireId: destinataire.id, objet, contenu })
      .returning({ id: rapportHierarchique.id });

    return { id: cree.id, auteurNom: moi?.nomComplet ?? "", emailDestinataire: cible?.email ?? null, entrepriseNom: monEntreprise?.nom ?? "" };
  });

  if ("erreur" in resultat) return { erreur: resultat.erreur };

  if (resultat.emailDestinataire) {
    const base = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
    const lien = `${base}${CHEMIN}/${resultat.id}`;
    after(() =>
      alerterParEmail(
        [resultat.emailDestinataire!],
        `Nouveau rapport de ${resultat.auteurNom} : ${objet}`,
        `<p><strong>${echapper(resultat.auteurNom)}</strong> vous a adressé un rapport : « ${echapper(objet)} ».</p><p><a href="${lien}">Lire le rapport</a></p><p>Le rapport est confidentiel : il n'est visible que de vous et de son auteur.</p>`,
      ),
    );
  }

  revalidatePath(CHEMIN);
  return { envoye: true };
}
