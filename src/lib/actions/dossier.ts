"use server";

import { eq, and } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { avecEntreprise } from "@/db/client";
import { dossier, contact, commentaire, entreprise } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { disponible } from "@/lib/plans";

/**
 * Création manuelle (docs/palier-2-*, section 8, étape 2) — pour un client
 * existant avant la mise en place du produit, ou tout simplement un
 * prospect que l'entreprise veut suivre comme dossier avant même un devis
 * accepté. Le pont automatique (src/lib/projets/pont.ts) couvre le cas
 * "premier devis accepté" ; ceci couvre le reste.
 */
export async function creerDossier(contactId: string) {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte.role, "DOSSIERS", "CREER")) return;

  const idDossier = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [monEntreprise] = await tx
      .select({ planAbonnement: entreprise.planAbonnement, statutAbonnement: entreprise.statutAbonnement })
      .from(entreprise)
      .where(eq(entreprise.id, utilisateurConnecte.entrepriseId));
    if (!disponible(monEntreprise, "DOSSIERS")) return null;

    const [existant] = await tx
      .select({ id: dossier.id })
      .from(dossier)
      .where(and(eq(dossier.entrepriseId, utilisateurConnecte.entrepriseId), eq(dossier.contactId, contactId)));
    if (existant) return existant.id;

    const [leContact] = await tx.select({ nom: contact.nom }).from(contact).where(eq(contact.id, contactId));
    if (!leContact) return null;

    const [nouveau] = await tx
      .insert(dossier)
      .values({
        entrepriseId: utilisateurConnecte.entrepriseId,
        contactId,
        titre: leContact.nom,
        responsableId: utilisateurConnecte.utilisateurId,
      })
      .returning({ id: dossier.id });

    return nouveau.id;
  });

  if (idDossier) {
    revalidatePath("/app/projets");
    redirect(`/app/projets/dossiers/${idDossier}`);
  }
}

export type EtatCommentaire = { erreur?: string } | null;

export async function ajouterCommentaireDossier(_etat: EtatCommentaire, formData: FormData): Promise<EtatCommentaire> {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte.role, "DOSSIERS", "MODIFIER")) {
    return { erreur: "Vous n'avez pas le droit de commenter ce dossier." };
  }

  const dossierId = String(formData.get("dossierId") ?? "");
  const contenu = String(formData.get("contenu") ?? "").trim();
  if (!contenu) return { erreur: "Le commentaire ne peut pas être vide." };

  await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) =>
    tx.insert(commentaire).values({
      entrepriseId: utilisateurConnecte.entrepriseId,
      dossierId,
      auteurId: utilisateurConnecte.utilisateurId,
      contenu,
    })
  );

  revalidatePath(`/app/projets/dossiers/${dossierId}`);
  return null;
}

/**
 * Un Dossier ne se supprime jamais (aucune règle métier ne l'exige, mais
 * cohérent avec l'esprit "jamais de perte d'historique" déjà posé pour les
 * factures) — seule une archive est possible, réversible.
 */
export async function archiverDossier(dossierId: string) {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte.role, "DOSSIERS", "MODIFIER")) return;

  await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) =>
    tx.update(dossier).set({ statut: "ARCHIVE" }).where(eq(dossier.id, dossierId))
  );

  revalidatePath(`/app/projets/dossiers/${dossierId}`);
  revalidatePath("/app/projets");
}

export async function reactiverDossier(dossierId: string) {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte.role, "DOSSIERS", "MODIFIER")) return;

  await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) =>
    tx.update(dossier).set({ statut: "ACTIF" }).where(eq(dossier.id, dossierId))
  );

  revalidatePath(`/app/projets/dossiers/${dossierId}`);
  revalidatePath("/app/projets");
}
