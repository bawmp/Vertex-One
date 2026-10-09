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
});

export type LeadExterne = z.infer<typeof schemaLeadExterne>;

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
      .select({ id: lead.id })
      .from(lead)
      .where(and(eq(lead.entrepriseId, entrepriseId), eq(lead.sourceExterne, donnees.source), eq(lead.referenceExterne, donnees.reference)));
    if (existant) return { id: existant.id, doublon: true, assigneEmail: null, nom: donnees.nom, source: donnees.source };
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
