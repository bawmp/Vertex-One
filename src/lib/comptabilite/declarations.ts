import { and, eq } from "drizzle-orm";
import type { TransactionDrizzle } from "@/db/client";
import { declarationFiscale } from "@/db/schema";
import { m } from "@/lib/i18n/catalogue";
import { echeanceTva, montantDeclareValide, nettoyerReference, STATUTS_DECLARATION, type StatutDeclaration } from "./declarations-regles";

export type DeclarationLue = { periode: string; echeance: string; statut: StatutDeclaration; montant: number | null; reference: string | null; declareeLe: Date | null };
export type Resultat = { ok: true } | { ok: false; erreur: string };

export async function listerDeclarations(tx: TransactionDrizzle, entrepriseId: string, type: string): Promise<Map<string, DeclarationLue>> {
  const lignes = await tx.select().from(declarationFiscale).where(and(eq(declarationFiscale.entrepriseId, entrepriseId), eq(declarationFiscale.type, type)));
  return new Map(lignes.map((l) => [l.periode, { periode: l.periode, echeance: l.echeance, statut: l.statut as StatutDeclaration, montant: l.montant, reference: l.reference, declareeLe: l.declareeLe }]));
}

export const listerDeclarationsTva = (tx: TransactionDrizzle, entrepriseId: string) => listerDeclarations(tx, entrepriseId, "TVA");

/**
 * Note où en est la déclaration de TVA d'un mois. L'échéance est recalculée ici (jamais prise du navigateur) ; le montant déclaré et
 * la référence du récépissé sont saisis par l'entreprise. Un même mois n'a qu'une ligne : la saisir de nouveau la met à jour.
 */
export async function noterDeclarationTva(tx: TransactionDrizzle, entrepriseId: string, utilisateurId: string, saisie: { periode: string; statut: string; montant: number | null; reference: string }, type: "TVA" | "ACOMPTE_IS" = "TVA"): Promise<Resultat> {
  const echeance = echeanceTva(saisie.periode);
  if (!echeance) return { ok: false, erreur: m("Mois invalide.") };
  if (!(STATUTS_DECLARATION as readonly string[]).includes(saisie.statut)) return { ok: false, erreur: m("Statut inconnu.") };
  if (saisie.montant !== null && !montantDeclareValide(saisie.montant)) return { ok: false, erreur: m("Le montant est un entier positif.") };
  const reference = nettoyerReference(saisie.reference) || null;
  const declareeLe = saisie.statut === "A_FAIRE" ? null : new Date();
  await tx
    .insert(declarationFiscale)
    .values({ entrepriseId, type, periode: saisie.periode, echeance, statut: saisie.statut, montant: saisie.montant, reference, declareeLe, modifieParId: utilisateurId })
    .onConflictDoUpdate({ target: [declarationFiscale.entrepriseId, declarationFiscale.type, declarationFiscale.periode], set: { statut: saisie.statut, montant: saisie.montant, reference, declareeLe, modifieParId: utilisateurId } });
  return { ok: true };
}
