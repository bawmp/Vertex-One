import { eq } from "drizzle-orm";
import type { TransactionDrizzle } from "@/db/client";
import { devis, ligneDevis, facture, ligneFacture, prospect, entreprise } from "@/db/schema";
import { idsVisibles } from "@/lib/portee";
import type { UtilisateurConnecte } from "@/lib/session";

/**
 * Extrait de la Route Handler PDF d'origine — réutilisé tel quel par
 * l'action d'envoi par email (elle a besoin exactement des mêmes données
 * pour générer la même pièce jointe), pour éviter de dupliquer la requête
 * et le contrôle de portée (idsVisibles).
 */
export async function recupererDevisPourPDF(tx: TransactionDrizzle, utilisateurConnecte: UtilisateurConnecte, devisId: string) {
  const [d] = await tx.select().from(devis).where(eq(devis.id, devisId));
  if (!d) return null;

  const visibles = await idsVisibles(tx, utilisateurConnecte, "FACTURATION");
  const [p] = await tx.select().from(prospect).where(eq(prospect.id, d.prospectId));
  if (visibles !== "TOUT" && p && !visibles.includes(p.assigneAId)) return null;

  const [lignes, [monEntreprise]] = await Promise.all([
    tx.select().from(ligneDevis).where(eq(ligneDevis.devisId, devisId)),
    tx.select().from(entreprise).where(eq(entreprise.id, utilisateurConnecte.entrepriseId)),
  ]);

  return { devis: d, lignes, prospect: p, entreprise: monEntreprise };
}

export async function recupererFacturePourPDF(tx: TransactionDrizzle, utilisateurConnecte: UtilisateurConnecte, factureId: string) {
  const [f] = await tx.select().from(facture).where(eq(facture.id, factureId));
  if (!f) return null;

  const visibles = await idsVisibles(tx, utilisateurConnecte, "FACTURATION");
  const [p] = await tx.select().from(prospect).where(eq(prospect.id, f.prospectId));
  if (visibles !== "TOUT" && p && !visibles.includes(p.assigneAId)) return null;

  const [lignes, [monEntreprise]] = await Promise.all([
    tx.select().from(ligneFacture).where(eq(ligneFacture.factureId, factureId)),
    tx.select().from(entreprise).where(eq(entreprise.id, utilisateurConnecte.entrepriseId)),
  ]);

  return { facture: f, lignes, prospect: p, entreprise: monEntreprise };
}
