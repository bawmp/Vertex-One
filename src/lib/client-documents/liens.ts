import { eq } from "drizzle-orm";
import { generateRandomString } from "better-auth/crypto";
import { db, type TransactionDrizzle } from "@/db/client";
import { lienClientDocument } from "@/db/schema";

export function urlBase(): string {
  return process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
}

export function urlPubliqueDevis(jeton: string): string {
  return `${urlBase()}/devis/${jeton}`;
}

export function urlPubliqueFacture(jeton: string): string {
  return `${urlBase()}/facture/${jeton}`;
}

/**
 * Renvoie le jeton du lien public d'un devis ou d'une facture, en le créant au
 * premier besoin (un seul lien par document, réutilisé à chaque envoi). Le jeton
 * est l'unique secret qui ouvre la page client : 32 caractères aléatoires.
 * À appeler dans avecEntreprise() — l'écriture est strictement limitée à
 * l'entreprise courante par la RLS.
 */
export async function obtenirOuCreerLien(tx: TransactionDrizzle, entrepriseId: string, cible: { devisId: string } | { factureId: string }): Promise<string> {
  const condition = "devisId" in cible ? eq(lienClientDocument.devisId, cible.devisId) : eq(lienClientDocument.factureId, cible.factureId);
  const [existant] = await tx.select({ jeton: lienClientDocument.jeton }).from(lienClientDocument).where(condition);
  if (existant) return existant.jeton;

  const jeton = generateRandomString(32, "a-z", "A-Z", "0-9");
  await tx.insert(lienClientDocument).values({
    entrepriseId,
    jeton,
    devisId: "devisId" in cible ? cible.devisId : undefined,
    factureId: "factureId" in cible ? cible.factureId : undefined,
  });
  return jeton;
}

/**
 * Retrouve un lien par son jeton, sans session : lecture anonyme autorisée par la
 * policy RLS dédiée de lien_client_document (quand app.entreprise_id n'est pas
 * positionné). N'expose qu'un identifiant d'entreprise et de document ; toutes les
 * données du document sont ensuite lues via avecEntreprise() avec CET entrepriseId,
 * jamais un identifiant venu du navigateur.
 */
export async function trouverLien(jeton: string): Promise<{ entrepriseId: string; devisId: string | null; factureId: string | null } | null> {
  if (!/^[A-Za-z0-9]{32}$/.test(jeton)) return null;
  const [lien] = await db
    .select({ entrepriseId: lienClientDocument.entrepriseId, devisId: lienClientDocument.devisId, factureId: lienClientDocument.factureId })
    .from(lienClientDocument)
    .where(eq(lienClientDocument.jeton, jeton));
  return lien ?? null;
}
