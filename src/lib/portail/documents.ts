import { and, desc, eq, inArray, ne } from "drizzle-orm";
import type { TransactionDrizzle } from "@/db/client";
import { devis, facture, paiement } from "@/db/schema";
import { calculerSolde } from "@/lib/facturation/tranche";

/**
 * Factures et devis d'UN Contact, pour son portail : la requête filtre toujours sur ce Contact (en plus de la RLS de l'entreprise), jamais sur
 * un identifiant venu du navigateur. Les brouillons de devis ne sont jamais montrés. À appeler dans avecEntreprise().
 */
export async function lireDocumentsDuContact(tx: TransactionDrizzle, contactId: string) {
  const factures = await tx
    .select({ id: facture.id, numero: facture.numero, statut: facture.statut, montantTTC: facture.montantTTC, dateEmission: facture.dateEmission })
    .from(facture)
    .where(eq(facture.contactId, contactId))
    .orderBy(desc(facture.dateEmission));
  const reglements = factures.length ? await tx.select({ factureId: paiement.factureId, montant: paiement.montant }).from(paiement).where(inArray(paiement.factureId, factures.map((f) => f.id))) : [];
  const devisListe = await tx
    .select({ id: devis.id, numero: devis.numero, statut: devis.statut, montantTTC: devis.montantTTC, dateValidite: devis.dateValidite })
    .from(devis)
    .where(and(eq(devis.contactId, contactId), ne(devis.statut, "BROUILLON")))
    .orderBy(desc(devis.dateValidite));
  return {
    factures: factures.map((f) => ({ ...f, solde: calculerSolde(f.montantTTC, reglements.filter((x) => x.factureId === f.id)).solde })),
    devis: devisListe,
  };
}

/** Identifiant de la facture si elle appartient bien à ce Contact, sinon null. */
export async function trouverFactureDuContact(tx: TransactionDrizzle, contactId: string, factureId: string): Promise<string | null> {
  const [f] = await tx.select({ id: facture.id }).from(facture).where(and(eq(facture.id, factureId), eq(facture.contactId, contactId)));
  return f?.id ?? null;
}

/** Identifiant du devis s'il appartient bien à ce Contact et n'est pas un brouillon, sinon null. */
export async function trouverDevisDuContact(tx: TransactionDrizzle, contactId: string, devisId: string): Promise<string | null> {
  const [d] = await tx.select({ id: devis.id }).from(devis).where(and(eq(devis.id, devisId), eq(devis.contactId, contactId), ne(devis.statut, "BROUILLON")));
  return d?.id ?? null;
}
