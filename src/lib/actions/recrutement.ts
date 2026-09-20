"use server";

import { z } from "zod";
import { and, count, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { avecEntreprise, type TransactionDrizzle } from "@/db/client";
import { entreprise, parametreRecrutement, posteOuvert, candidature } from "@/db/schema";
import { recupererUtilisateurConnecte, type UtilisateurConnecte } from "@/lib/session";
import { disponibleAddon } from "@/lib/plans";
import { peut } from "@/lib/permissions";
import { effacerObjetStockage } from "@/lib/documents/stockage";
import { idsVisibles } from "@/lib/portee";
import { convertirCandidatureEnInvitation } from "@/lib/recrutement/conversion";
import { TYPES_CONTRAT } from "@/lib/recrutement/validation";

const CHEMIN = "/app/recrutement";

export type EtatRecrutementConfig = { erreur?: string } | null;

/** Configuration — réservée à l'Administrateur, même niveau que creerServiceReservable(). */
const schemaParametres = z.object({
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9-]+$/, "Le lien ne peut contenir que des lettres minuscules, chiffres et tirets."),
  titre: z.string().trim().min(2, "Le titre est requis."),
  texte: z.string().trim().optional(),
  // Un atout par ligne, plafonné pour rester lisible sur la page publique.
  avantages: z
    .string()
    .optional()
    .transform((v) =>
      (v ?? "")
        .split("\n")
        .map((ligne) => ligne.trim().slice(0, 90))
        .filter(Boolean)
        .slice(0, 8)
    ),
});

export async function configurerParametresRecrutement(_etat: EtatRecrutementConfig, formData: FormData): Promise<EtatRecrutementConfig> {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (utilisateurConnecte.role !== "ADMIN") {
    return { erreur: "Seul l'Administrateur peut configurer le recrutement." };
  }

  const analyse = schemaParametres.safeParse({ slug: formData.get("slug"), titre: formData.get("titre"), texte: formData.get("texte") || "", avantages: formData.get("avantages") || "" });
  if (!analyse.success) {
    return { erreur: analyse.error.issues[0]?.message ?? "Formulaire invalide." };
  }
  const { slug, titre, texte, avantages } = analyse.data;

  const resultat = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [monEntreprise] = await tx.select().from(entreprise).where(eq(entreprise.id, utilisateurConnecte.entrepriseId));
    if (!(await disponibleAddon(tx, monEntreprise, "RECRUTEMENT"))) {
      return { erreur: "Le module Recrutement n'est pas activé pour votre entreprise." };
    }

    const [existant] = await tx.select({ id: parametreRecrutement.id }).from(parametreRecrutement).where(eq(parametreRecrutement.entrepriseId, utilisateurConnecte.entrepriseId));

    try {
      if (existant) {
        await tx.update(parametreRecrutement).set({ slug, titre, texte: texte || null, avantages: avantages.length > 0 ? avantages : null }).where(eq(parametreRecrutement.id, existant.id));
      } else {
        await tx.insert(parametreRecrutement).values({ entrepriseId: utilisateurConnecte.entrepriseId, slug, titre, texte: texte || undefined, avantages: avantages.length > 0 ? avantages : undefined });
      }
    } catch {
      return { erreur: "Ce lien est déjà utilisé — choisissez-en un autre." };
    }
    return null;
  });

  if (resultat?.erreur) return resultat;

  revalidatePath(`${CHEMIN}/parametres`);
  return null;
}

export async function publierRecrutement(publie: boolean) {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (utilisateurConnecte.role !== "ADMIN") return;

  await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) => tx.update(parametreRecrutement).set({ publie }).where(eq(parametreRecrutement.entrepriseId, utilisateurConnecte.entrepriseId)));

  revalidatePath(`${CHEMIN}/parametres`);
}

const schemaPoste = z.object({
  titre: z.string().trim().min(1, "Le titre est requis."),
  description: z.string().trim().optional(),
  lieu: z.string().trim().optional(),
  typeContrat: z.enum(TYPES_CONTRAT).optional().or(z.literal("")),
});

export async function creerPosteOuvert(_etat: EtatRecrutementConfig, formData: FormData): Promise<EtatRecrutementConfig> {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (utilisateurConnecte.role !== "ADMIN") {
    return { erreur: "Seul l'Administrateur peut créer un poste." };
  }

  const analyse = schemaPoste.safeParse({ titre: formData.get("titre"), description: formData.get("description") || "", lieu: formData.get("lieu") || "", typeContrat: formData.get("typeContrat") || "" });
  if (!analyse.success) {
    return { erreur: analyse.error.issues[0]?.message ?? "Formulaire invalide." };
  }
  const { titre, description, lieu, typeContrat } = analyse.data;

  const resultat = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [monEntreprise] = await tx.select().from(entreprise).where(eq(entreprise.id, utilisateurConnecte.entrepriseId));
    if (!(await disponibleAddon(tx, monEntreprise, "RECRUTEMENT"))) {
      return { erreur: "Le module Recrutement n'est pas activé pour votre entreprise." };
    }

    await tx.insert(posteOuvert).values({ entrepriseId: utilisateurConnecte.entrepriseId, titre, description: description || undefined, lieu: lieu || undefined, typeContrat: typeContrat || undefined, creeParId: utilisateurConnecte.utilisateurId });
    return null;
  });

  if (resultat?.erreur) return resultat;

  revalidatePath(`${CHEMIN}/postes`);
  return null;
}

export async function desactiverPosteOuvert(posteId: string) {
  await changerActifPoste(posteId, false);
}

export async function reactiverPosteOuvert(posteId: string) {
  await changerActifPoste(posteId, true);
}

async function changerActifPoste(posteId: string, actif: boolean) {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (utilisateurConnecte.role !== "ADMIN") return;

  await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) =>
    tx.update(posteOuvert).set({ actif }).where(and(eq(posteOuvert.id, posteId), eq(posteOuvert.entrepriseId, utilisateurConnecte.entrepriseId)))
  );

  revalidatePath(`${CHEMIN}/postes`);
}

/** Modifie une offre déjà publiée : la page publique la reflète aussitôt (elle relit la base à chaque visite). */
export async function modifierPosteOuvert(_etat: EtatRecrutementConfig, formData: FormData): Promise<EtatRecrutementConfig> {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (utilisateurConnecte.role !== "ADMIN") {
    return { erreur: "Seul l'Administrateur peut modifier un poste." };
  }

  const posteId = formData.get("posteId");
  if (typeof posteId !== "string" || !posteId) return { erreur: "Poste introuvable." };

  const analyse = schemaPoste.safeParse({ titre: formData.get("titre"), description: formData.get("description") || "", lieu: formData.get("lieu") || "", typeContrat: formData.get("typeContrat") || "" });
  if (!analyse.success) {
    return { erreur: analyse.error.issues[0]?.message ?? "Formulaire invalide." };
  }
  const { titre, description, lieu, typeContrat } = analyse.data;

  const resultat = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const modifies = await tx
      .update(posteOuvert)
      .set({ titre, description: description || null, lieu: lieu || null, typeContrat: typeContrat || null })
      .where(and(eq(posteOuvert.id, posteId), eq(posteOuvert.entrepriseId, utilisateurConnecte.entrepriseId)))
      .returning({ id: posteOuvert.id });
    return modifies.length === 0 ? { erreur: "Poste introuvable." } : null;
  });

  if (resultat?.erreur) return resultat;

  revalidatePath(`${CHEMIN}/postes`);
  return null;
}

/**
 * Suppression réelle, seulement si aucune candidature n'y est rattachée : les
 * candidatures (et leurs CV) sont des données de candidats qu'on ne fait pas
 * disparaître en silence en supprimant l'offre. Dans ce cas, il faut désactiver.
 */
export async function supprimerPosteOuvert(posteId: string): Promise<{ erreur?: string } | null> {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (utilisateurConnecte.role !== "ADMIN") return { erreur: "Seul l'Administrateur peut supprimer un poste." };

  const resultat = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [{ total }] = await tx
      .select({ total: count() })
      .from(candidature)
      .where(and(eq(candidature.posteId, posteId), eq(candidature.entrepriseId, utilisateurConnecte.entrepriseId)));
    if (total > 0) {
      return { erreur: `Ce poste a ${total} candidature${total > 1 ? "s" : ""} : il ne peut pas être supprimé. Désactivez-le pour le retirer de la page publique.` };
    }
    await tx.delete(posteOuvert).where(and(eq(posteOuvert.id, posteId), eq(posteOuvert.entrepriseId, utilisateurConnecte.entrepriseId)));
    return null;
  });

  if (resultat?.erreur) return resultat;

  revalidatePath(`${CHEMIN}/postes`);
  return null;
}

const STATUTS_VALIDES = ["RECUE", "EN_EXAMEN", "ENTRETIEN", "OFFRE", "EMBAUCHE", "REJETEE"] as const;

async function candidatureDansLaPortee(tx: TransactionDrizzle, utilisateurConnecte: UtilisateurConnecte, candidatureId: string): Promise<boolean> {
  const ids = await idsVisibles(tx, utilisateurConnecte, "RECRUTEMENT");
  if (ids === "TOUT") return true;

  const [ligne] = await tx.select({ assigneAId: candidature.assigneAId }).from(candidature).where(eq(candidature.id, candidatureId));
  return ligne?.assigneAId ? ids.includes(ligne.assigneAId) : false;
}

/**
 * Le statut n'est qu'une annotation TS côté serveur — revérifié à
 * l'exécution avant tout UPDATE (même garde que changerStatutTicket(),
 * jamais fait confiance à une valeur castée côté client).
 */
export async function changerStatutCandidature(candidatureId: string, statut: (typeof STATUTS_VALIDES)[number]) {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!STATUTS_VALIDES.includes(statut)) return;
  if (!peut(utilisateurConnecte.role, "RECRUTEMENT", "MODIFIER")) return;

  await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    if (!(await candidatureDansLaPortee(tx, utilisateurConnecte, candidatureId))) return;
    await tx.update(candidature).set({ statut }).where(eq(candidature.id, candidatureId));
  });

  revalidatePath(CHEMIN);
}

export async function assignerCandidature(candidatureId: string, assigneAId: string) {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (utilisateurConnecte.role !== "ADMIN") return;

  await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) => tx.update(candidature).set({ assigneAId }).where(eq(candidature.id, candidatureId)));

  revalidatePath(CHEMIN);
}

const schemaModificationCandidature = z.object({
  candidatureId: z.string().min(1),
  nom: z.string().trim().min(2, "Le nom est trop court."),
  telephone: z.string().trim().min(6, "Numéro de téléphone invalide."),
  email: z.email("Adresse email invalide.").optional().or(z.literal("")),
  message: z.string().trim().optional(),
});

/** Corrige les coordonnées ou le message d'une candidature déjà reçue. Le CV et le poste visé ne changent pas. */
export async function modifierCandidature(_etat: EtatRecrutementConfig, formData: FormData): Promise<EtatRecrutementConfig> {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte.role, "RECRUTEMENT", "MODIFIER")) {
    return { erreur: "Vous n'avez pas le droit de modifier une candidature." };
  }

  const analyse = schemaModificationCandidature.safeParse({
    candidatureId: formData.get("candidatureId"),
    nom: formData.get("nom"),
    telephone: formData.get("telephone"),
    email: formData.get("email") || "",
    message: formData.get("message") || "",
  });
  if (!analyse.success) {
    return { erreur: analyse.error.issues[0]?.message ?? "Formulaire invalide." };
  }
  const { candidatureId, nom, telephone, email, message } = analyse.data;

  const resultat = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    if (!(await candidatureDansLaPortee(tx, utilisateurConnecte, candidatureId))) return { erreur: "Candidature introuvable." };
    const modifiees = await tx
      .update(candidature)
      .set({ nom, telephone, email: email || null, message: message || null })
      .where(and(eq(candidature.id, candidatureId), eq(candidature.entrepriseId, utilisateurConnecte.entrepriseId)))
      .returning({ id: candidature.id });
    return modifiees.length === 0 ? { erreur: "Candidature introuvable." } : null;
  });

  if (resultat?.erreur) return resultat;

  revalidatePath(CHEMIN);
  return null;
}

/**
 * Suppression réelle (candidature + CV stocké), sur demande légitime du candidat
 * ou pour un doublon. Refusée si la candidature a déjà été convertie en employé :
 * la trace de l'embauche doit rester.
 */
export async function supprimerCandidature(candidatureId: string): Promise<{ erreur?: string } | null> {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte.role, "RECRUTEMENT", "SUPPRIMER")) {
    return { erreur: "Seul l'Administrateur peut supprimer une candidature." };
  }

  const resultat = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    if (!(await candidatureDansLaPortee(tx, utilisateurConnecte, candidatureId))) return { erreur: "Candidature introuvable." };
    const [ligne] = await tx
      .select({ invitationId: candidature.invitationId, cvCleStockage: candidature.cvCleStockage })
      .from(candidature)
      .where(and(eq(candidature.id, candidatureId), eq(candidature.entrepriseId, utilisateurConnecte.entrepriseId)));
    if (!ligne) return { erreur: "Candidature introuvable." };
    if (ligne.invitationId) return { erreur: "Cette candidature a été convertie en employé : elle ne peut pas être supprimée." };

    await tx.delete(candidature).where(and(eq(candidature.id, candidatureId), eq(candidature.entrepriseId, utilisateurConnecte.entrepriseId)));
    return { cle: ligne.cvCleStockage };
  });

  if ("erreur" in resultat && resultat.erreur) return { erreur: resultat.erreur };

  // Après la suppression en base : un échec de nettoyage R2 laisse au pire un fichier orphelin, jamais une candidature sans CV.
  if ("cle" in resultat && resultat.cle) {
    try {
      await effacerObjetStockage(resultat.cle);
    } catch {
      // Fichier orphelin toléré.
    }
  }

  revalidatePath(CHEMIN);
  return null;
}

const schemaConversion = z.object({
  candidatureId: z.string().min(1),
  roleProposee: z.enum(["MANAGER", "EMPLOYE"]),
  typeContratPropose: z.enum(["CDI", "CDD", "STAGE", "PRESTATAIRE"]),
  dateEmbauchePropose: z.string().min(1, "La date d'embauche est requise."),
});

export type EtatConversion = { erreur?: string; succes?: string } | null;

/**
 * Réutilise le flux invitation existant tel quel — aucune nouvelle mécanique
 * de création de compte : accepterInvitation() (src/lib/actions/invitation.ts)
 * gère déjà l'activation du compte et la création du dossierRH, sans aucune
 * modification nécessaire ici.
 */
export async function convertirCandidatureEnEmploye(_etat: EtatConversion, formData: FormData): Promise<EtatConversion> {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (utilisateurConnecte.role !== "ADMIN") {
    return { erreur: "Seul l'Administrateur peut convertir une candidature en employé." };
  }

  const analyse = schemaConversion.safeParse({
    candidatureId: formData.get("candidatureId"),
    roleProposee: formData.get("roleProposee"),
    typeContratPropose: formData.get("typeContratPropose"),
    dateEmbauchePropose: formData.get("dateEmbauchePropose"),
  });
  if (!analyse.success) {
    return { erreur: analyse.error.issues[0]?.message ?? "Formulaire invalide." };
  }
  const { candidatureId, roleProposee, typeContratPropose, dateEmbauchePropose } = analyse.data;

  const resultat = await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) =>
    convertirCandidatureEnInvitation(tx, utilisateurConnecte.entrepriseId, candidatureId, roleProposee, typeContratPropose, new Date(dateEmbauchePropose))
  );

  if (resultat.erreur) return resultat;

  revalidatePath(CHEMIN);
  return resultat;
}
