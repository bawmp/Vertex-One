import { and, eq } from "drizzle-orm";
import type { TransactionDrizzle } from "@/db/client";
import { compteComptable } from "@/db/schema";
import { m } from "@/lib/i18n/catalogue";
import { classeDuNumero, nettoyerLibelle } from "./classe-compte";

/**
 * Comptes personnalisés (2026-11-02) : une entreprise ajoute ses propres comptes au plan SYSCOHADA (une sous-ligne de charges, un
 * compte de trésorerie supplémentaire…). Stockés dans `compte_comptable` avec l'identifiant de l'entreprise : visibles d'elle seule,
 * jamais d'une autre. Règles : numéro de 6 chiffres commençant par la classe (1 à 8), jamais un numéro du référentiel ni un numéro
 * déjà pris par l'entreprise, jamais supprimé s'il porte une écriture ou sert déjà ailleurs.
 */

export type ResultatCompte = { ok: true; id?: string } | { ok: false; erreur: string };

const ERREUR_UNICITE = "23505";
const ERREUR_CLE_ETRANGERE = "23503";
const codeErreur = (e: unknown): string | undefined => {
  const brut = e as { code?: string; cause?: { code?: string } };
  return brut?.code ?? brut?.cause?.code;
};

export async function creerComptePersonnalise(tx: TransactionDrizzle, entrepriseId: string, numero: string, libelle: string): Promise<ResultatCompte> {
  const classe = classeDuNumero(numero);
  if (classe === null) return { ok: false, erreur: m("Le numéro doit avoir 6 chiffres et commencer par la classe du compte (1 à 8).") };
  const intitule = nettoyerLibelle(libelle);
  if (intitule.length < 2 || intitule.length > 80) return { ok: false, erreur: m("L'intitulé doit faire entre 2 et 80 caractères.") };

  // Sous la protection par entreprise, cette lecture voit les comptes du référentiel ET ceux de l'entreprise, jamais ceux d'une autre.
  const [existant] = await tx.select({ id: compteComptable.id }).from(compteComptable).where(eq(compteComptable.numero, numero));
  if (existant) return { ok: false, erreur: m("Ce numéro de compte existe déjà : choisissez-en un autre.") };

  try {
    const [cree] = await tx.transaction((sp) => sp.insert(compteComptable).values({ numero, libelle: intitule, classe, entrepriseId }).returning({ id: compteComptable.id }));
    return { ok: true, id: cree.id };
  } catch (e) {
    if (codeErreur(e) === ERREUR_UNICITE) return { ok: false, erreur: m("Ce numéro de compte existe déjà : choisissez-en un autre.") };
    throw e;
  }
}

export async function renommerComptePersonnalise(tx: TransactionDrizzle, entrepriseId: string, compteId: string, libelle: string): Promise<ResultatCompte> {
  const intitule = nettoyerLibelle(libelle);
  if (intitule.length < 2 || intitule.length > 80) return { ok: false, erreur: m("L'intitulé doit faire entre 2 et 80 caractères.") };
  const modifies = await tx
    .update(compteComptable)
    .set({ libelle: intitule })
    .where(and(eq(compteComptable.id, compteId), eq(compteComptable.entrepriseId, entrepriseId)))
    .returning({ id: compteComptable.id });
  return modifies.length === 0 ? { ok: false, erreur: m("Compte introuvable : seuls vos comptes personnalisés se modifient.") } : { ok: true };
}

/** Supprime un compte personnalisé jamais utilisé. Un compte du référentiel, ou d'une autre entreprise, est introuvable ici. */
export async function supprimerComptePersonnalise(tx: TransactionDrizzle, entrepriseId: string, compteId: string): Promise<ResultatCompte> {
  const [compte] = await tx.select({ id: compteComptable.id }).from(compteComptable).where(and(eq(compteComptable.id, compteId), eq(compteComptable.entrepriseId, entrepriseId)));
  if (!compte) return { ok: false, erreur: m("Compte introuvable : seuls vos comptes personnalisés se suppriment.") };
  try {
    // Le point de sauvegarde (transaction imbriquée) garde la transaction principale utilisable si une écriture, une dépense ou un budget s'appuie encore sur ce compte.
    await tx.transaction((sp) => sp.delete(compteComptable).where(and(eq(compteComptable.id, compteId), eq(compteComptable.entrepriseId, entrepriseId))));
    return { ok: true };
  } catch (e) {
    if (codeErreur(e) === ERREUR_CLE_ETRANGERE) return { ok: false, erreur: m("Ce compte est déjà utilisé (écritures, dépenses ou budgets) : il ne peut pas être supprimé.") };
    throw e;
  }
}
