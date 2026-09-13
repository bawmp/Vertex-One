"use server";

import { z } from "zod";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { avecEntreprise, type TransactionDrizzle } from "@/db/client";
import { entreprise, parametreRecrutement, posteOuvert, candidature } from "@/db/schema";
import { recupererUtilisateurConnecte, type UtilisateurConnecte } from "@/lib/session";
import { disponibleAddon } from "@/lib/plans";
import { idsVisibles } from "@/lib/portee";
import { convertirCandidatureEnInvitation } from "@/lib/recrutement/conversion";

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
});

export async function configurerParametresRecrutement(_etat: EtatRecrutementConfig, formData: FormData): Promise<EtatRecrutementConfig> {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (utilisateurConnecte.role !== "ADMIN") {
    return { erreur: "Seul l'Administrateur peut configurer le recrutement." };
  }

  const analyse = schemaParametres.safeParse({ slug: formData.get("slug"), titre: formData.get("titre"), texte: formData.get("texte") || "" });
  if (!analyse.success) {
    return { erreur: analyse.error.issues[0]?.message ?? "Formulaire invalide." };
  }
  const { slug, titre, texte } = analyse.data;

  const resultat = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [monEntreprise] = await tx.select().from(entreprise).where(eq(entreprise.id, utilisateurConnecte.entrepriseId));
    if (!(await disponibleAddon(tx, monEntreprise, "RECRUTEMENT"))) {
      return { erreur: "Le module Recrutement n'est pas activé pour votre entreprise." };
    }

    const [existant] = await tx.select({ id: parametreRecrutement.id }).from(parametreRecrutement).where(eq(parametreRecrutement.entrepriseId, utilisateurConnecte.entrepriseId));

    try {
      if (existant) {
        await tx.update(parametreRecrutement).set({ slug, titre, texte: texte || null }).where(eq(parametreRecrutement.id, existant.id));
      } else {
        await tx.insert(parametreRecrutement).values({ entrepriseId: utilisateurConnecte.entrepriseId, slug, titre, texte: texte || undefined });
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
});

export async function creerPosteOuvert(_etat: EtatRecrutementConfig, formData: FormData): Promise<EtatRecrutementConfig> {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (utilisateurConnecte.role !== "ADMIN") {
    return { erreur: "Seul l'Administrateur peut créer un poste." };
  }

  const analyse = schemaPoste.safeParse({ titre: formData.get("titre"), description: formData.get("description") || "", lieu: formData.get("lieu") || "" });
  if (!analyse.success) {
    return { erreur: analyse.error.issues[0]?.message ?? "Formulaire invalide." };
  }
  const { titre, description, lieu } = analyse.data;

  const resultat = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [monEntreprise] = await tx.select().from(entreprise).where(eq(entreprise.id, utilisateurConnecte.entrepriseId));
    if (!(await disponibleAddon(tx, monEntreprise, "RECRUTEMENT"))) {
      return { erreur: "Le module Recrutement n'est pas activé pour votre entreprise." };
    }

    await tx.insert(posteOuvert).values({ entrepriseId: utilisateurConnecte.entrepriseId, titre, description: description || undefined, lieu: lieu || undefined, creeParId: utilisateurConnecte.utilisateurId });
    return null;
  });

  if (resultat?.erreur) return resultat;

  revalidatePath(`${CHEMIN}/postes`);
  return null;
}

export async function desactiverPosteOuvert(posteId: string) {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (utilisateurConnecte.role !== "ADMIN") return;

  await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) => tx.update(posteOuvert).set({ actif: false }).where(eq(posteOuvert.id, posteId)));

  revalidatePath(`${CHEMIN}/postes`);
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
