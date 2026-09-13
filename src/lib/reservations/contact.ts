import { and, eq, or } from "drizzle-orm";
import type { TransactionDrizzle } from "@/db/client";
import { contact } from "@/db/schema";

/**
 * Lien best-effort optionnel vers le CRM — ne crée jamais de Contact, ne
 * bloque jamais la réservation si rien n'est trouvé. contact.assigneAId est
 * NOT NULL (demanderait le même contournement "premier Admin" que
 * soumettreFormulaireContact()) : Booking ne doit dépendre du CRM en aucune
 * façon, une entreprise doit pouvoir acheter Booking seul (voir CLAUDE.md,
 * "Indépendance des modules").
 */
export async function resoudreContactOptionnel(tx: TransactionDrizzle, entrepriseId: string, telephone: string, email?: string): Promise<string | null> {
  const conditions = email ? or(eq(contact.telephone, telephone), eq(contact.email, email)) : eq(contact.telephone, telephone);

  const [trouve] = await tx
    .select({ id: contact.id })
    .from(contact)
    .where(and(eq(contact.entrepriseId, entrepriseId), conditions));

  return trouve?.id ?? null;
}
