import { z } from "zod";
import { and, asc, eq } from "drizzle-orm";
import type { TransactionDrizzle } from "@/db/client";
import { lead, utilisateur } from "@/db/schema";

/**
 * Corps accepté par `POST /api/externe/leads`. Tout est borné : cette entrée est publique (derrière une clé), jamais
 * de confiance dans la taille ni le contenu. Un lead exige un téléphone en base : s'il manque, « Non renseigné » est
 * inscrit (comme à l'import de données) plutôt que de refuser une demande réelle.
 */
export const schemaLeadExterne = z.object({
  nom: z.string().trim().min(2, "Le nom est requis (2 caractères minimum).").max(120),
  telephone: z.string().trim().max(40).optional(),
  email: z.union([z.literal(""), z.string().trim().email("Adresse email invalide.").max(160)]).optional(),
  societe: z.string().trim().max(160).optional(),
  message: z.string().trim().max(2000).optional(),
  source: z.string().trim().min(1).max(80).default("Site web"),
  reference: z.string().trim().min(1).max(120).optional(),
  // Complète un lead déjà créé avec cette référence (ex. Kyria apprend le vrai nom et le besoin au fil de la conversation).
  // Sans cet indicateur, un renvoi de la même référence reste un simple doublon qui ne change rien.
  miseAJour: z.boolean().optional(),
});

export type LeadExterne = z.infer<typeof schemaLeadExterne>;

/** Préfixe du nom donné à un prospect dont on ne connaît que le numéro (ex. « Prospect WhatsApp +237… »). */
const NOM_PROVISOIRE = "Prospect ";
const MARQUEUR_MISE_A_JOUR = "— Mise à jour —";

export type ResultatLeadExterne =
  | { id: string; doublon: boolean; assigneEmail: string | null; nom: string; source: string }
  | { erreur: "AUCUN_ADMIN" };

/**
 * Crée le lead dans l'entreprise de la clé (la transaction `tx` est déjà ouverte sous la RLS de CETTE entreprise).
 * Assigné au premier Administrateur actif, à réassigner ensuite depuis le CRM (même règle que les pages
 * d'atterrissage). Idempotent par (source, référence) : si l'émetteur renvoie sa requête, le lead existant est
 * renvoyé tel quel, jamais un second.
 */
export async function creerLeadExterne(tx: TransactionDrizzle, entrepriseId: string, donnees: LeadExterne): Promise<ResultatLeadExterne> {
  const [admin] = await tx
    .select({ id: utilisateur.id, email: utilisateur.email })
    .from(utilisateur)
    .where(and(eq(utilisateur.entrepriseId, entrepriseId), eq(utilisateur.role, "ADMIN"), eq(utilisateur.statut, "ACTIF")))
    .orderBy(asc(utilisateur.creeLe))
    .limit(1);
  if (!admin) return { erreur: "AUCUN_ADMIN" };

  if (donnees.reference) {
    const [existant] = await tx
      .select({ id: lead.id, nom: lead.nom, email: lead.email, societeCliente: lead.societeCliente, notes: lead.notes })
      .from(lead)
      .where(and(eq(lead.entrepriseId, entrepriseId), eq(lead.sourceExterne, donnees.source), eq(lead.referenceExterne, donnees.reference)));
    if (existant) {
      if (donnees.miseAJour) {
        // Jamais d'écrasement d'une saisie humaine : le nom n'est remplacé que s'il est encore le nom provisoire d'un
        // prospect anonyme, l'email et la société ne sont renseignés que s'ils sont vides. Le bloc « Mise à jour » des
        // notes, lui, est réécrit à chaque appel (une seule version, jamais empilée).
        const changements: Partial<typeof lead.$inferInsert> = {};
        if (donnees.nom && existant.nom.startsWith(NOM_PROVISOIRE) && !donnees.nom.startsWith(NOM_PROVISOIRE)) changements.nom = donnees.nom;
        if (donnees.email && !existant.email) changements.email = donnees.email;
        if (donnees.societe && !existant.societeCliente) changements.societeCliente = donnees.societe;
        if (donnees.message) {
          const base = (existant.notes ?? "").split(MARQUEUR_MISE_A_JOUR)[0].trimEnd();
          changements.notes = `${base}\n\n${MARQUEUR_MISE_A_JOUR}\n${donnees.message}`.trim();
        }
        if (Object.keys(changements).length > 0) await tx.update(lead).set(changements).where(and(eq(lead.id, existant.id), eq(lead.entrepriseId, entrepriseId)));
      }
      return { id: existant.id, doublon: true, assigneEmail: null, nom: donnees.nom, source: donnees.source };
    }
  }

  const notes = [`Reçu de « ${donnees.source} ».`, donnees.message ? `Message : ${donnees.message}` : null].filter(Boolean).join("\n");
  const [cree] = await tx
    .insert(lead)
    .values({
      entrepriseId,
      nom: donnees.nom,
      societeCliente: donnees.societe || undefined,
      telephone: donnees.telephone || "Non renseigné",
      email: donnees.email || undefined,
      statut: "NOUVEAU",
      notes,
      assigneAId: admin.id,
      sourceExterne: donnees.source,
      referenceExterne: donnees.reference,
    })
    .returning({ id: lead.id });

  return { id: cree.id, doublon: false, assigneEmail: admin.email, nom: donnees.nom, source: donnees.source };
}
