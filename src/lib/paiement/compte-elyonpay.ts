import "server-only";
import { and, eq, gt } from "drizzle-orm";
import { avecEntreprise, type TransactionDrizzle } from "@/db/client";
import { compteElyonpay, tentativePaiementFacture } from "@/db/schema";
import { CONTEXTE_PAIEMENT, chiffrerConfig, dechiffrerConfig } from "@/lib/boutique/chiffrement";
import type { IdentifiantsElyonpay } from "@/lib/elyonpay/utilitaires";

/**
 * Compte ElyonPay PROPRE à chaque entreprise (2026-11-20) : les paiements Mobile Money de ses clients vont directement sur ce compte.
 * La clé d'API est chiffrée en base et ne quitte JAMAIS le serveur : ce qui sert à l'affichage ne porte que ses 4 derniers caractères.
 */

/** Une tentative en attente depuis moins d'une heure : tant qu'elle court, on ne change ni ne retire le compte (la relire exigerait l'ancienne clé). */
const DELAI_TENTATIVE_EN_COURS_MS = 3_600_000;

export type EtatCompteElyonpay = {
  statut: "ACTIF" | "ERREUR";
  marchandId: number;
  nomMarchand: string;
  /** 4 derniers caractères de la clé, pour que l'Administrateur reconnaisse laquelle est branchée. */
  cleFin: string;
  derniereErreur: string | null;
  verifieLe: Date | null;
};

/** Ce qu'on peut montrer à l'écran : jamais la clé, ni chiffrée ni en clair. */
export async function lireEtatCompte(tx: TransactionDrizzle, entrepriseId: string): Promise<EtatCompteElyonpay | null> {
  const [c] = await tx.select().from(compteElyonpay).where(eq(compteElyonpay.entrepriseId, entrepriseId));
  if (!c) return null;
  return { statut: c.statut === "ERREUR" ? "ERREUR" : "ACTIF", marchandId: c.marchandId, nomMarchand: c.nomMarchand, cleFin: c.cleFin, derniereErreur: c.derniereErreur, verifieLe: c.verifieLe };
}

/**
 * Les identifiants à utiliser pour payer ou relire un paiement de cette entreprise, ou `null` si elle n'a pas de compte actif (jamais branché, clé refusée par ElyonPay
 * → « ERREUR », ou clé illisible parce que le secret de l'application a changé). `null` veut toujours dire : PAS de paiement en ligne, jamais un repli sur le compte de la plateforme.
 */
export async function lireIdentifiants(tx: TransactionDrizzle, entrepriseId: string): Promise<IdentifiantsElyonpay | null> {
  const [c] = await tx.select().from(compteElyonpay).where(eq(compteElyonpay.entrepriseId, entrepriseId));
  if (!c || c.statut !== "ACTIF") return null;
  const config = dechiffrerConfig(c.configChiffree, CONTEXTE_PAIEMENT);
  const cle = config?.cle;
  if (!cle) return null;
  return { cle, marchandId: c.marchandId, nomMarchand: c.nomMarchand };
}

/** Le paiement en ligne est-il proposé aux clients de cette entreprise ? (compte branché et actif) */
export async function compteActif(tx: TransactionDrizzle, entrepriseId: string): Promise<boolean> {
  return (await lireIdentifiants(tx, entrepriseId)) !== null;
}

/** Une tentative de paiement faite sur le compte de l'entreprise est-elle en attente (moins d'une heure) ? */
export async function paiementEnCours(tx: TransactionDrizzle, entrepriseId: string): Promise<boolean> {
  const [t] = await tx
    .select({ id: tentativePaiementFacture.id })
    .from(tentativePaiementFacture)
    .where(
      and(
        eq(tentativePaiementFacture.entrepriseId, entrepriseId),
        eq(tentativePaiementFacture.compte, "ENTREPRISE"),
        eq(tentativePaiementFacture.statut, "EN_ATTENTE"),
        gt(tentativePaiementFacture.creeLe, new Date(Date.now() - DELAI_TENTATIVE_EN_COURS_MS)),
      ),
    )
    .limit(1);
  return Boolean(t);
}

/** Branche (ou remplace) le compte de l'entreprise : la clé est chiffrée avant d'être écrite, et la ligne repasse « ACTIF » (une reconnexion efface l'erreur). */
export async function enregistrerCompte(
  tx: TransactionDrizzle,
  p: { entrepriseId: string; marchandId: number; nomMarchand: string; cle: string; creeParId: string },
): Promise<void> {
  const valeurs = {
    marchandId: p.marchandId,
    nomMarchand: p.nomMarchand,
    configChiffree: chiffrerConfig({ cle: p.cle }, CONTEXTE_PAIEMENT),
    cleFin: p.cle.slice(-4),
    statut: "ACTIF",
    derniereErreur: null,
    verifieLe: new Date(),
    modifieLe: new Date(),
  };
  await tx
    .insert(compteElyonpay)
    .values({ entrepriseId: p.entrepriseId, creeParId: p.creeParId, ...valeurs })
    .onConflictDoUpdate({ target: compteElyonpay.entrepriseId, set: { ...valeurs, creeParId: p.creeParId } });
}

export async function supprimerCompte(tx: TransactionDrizzle, entrepriseId: string): Promise<void> {
  await tx.delete(compteElyonpay).where(eq(compteElyonpay.entrepriseId, entrepriseId));
}

/**
 * ElyonPay a refusé la clé de cette entreprise (régénérée, révoquée…) : le paiement en ligne est suspendu (« ERREUR ») jusqu'à ce que l'Administrateur la reconnecte,
 * plutôt que de laisser des clients tenter de payer pour rien. Appelée depuis la relecture d'un paiement (aucune session) : ouvre sa propre transaction DANS l'entreprise.
 */
export async function marquerCompteEnErreur(entrepriseId: string, message: string): Promise<void> {
  await avecEntreprise(entrepriseId, (tx) =>
    tx.update(compteElyonpay).set({ statut: "ERREUR", derniereErreur: message, modifieLe: new Date() }).where(eq(compteElyonpay.entrepriseId, entrepriseId)),
  );
}
