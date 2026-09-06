import { eq } from "drizzle-orm";
import type { TransactionDrizzle } from "@/db/client";
import { demandeSignature, signataire, document, utilisateur } from "@/db/schema";

export type CertificatAudit = {
  demandeId: string;
  nomDocument: string;
  empreinteDocument: string;
  statut: string;
  creeParNom: string;
  creeLe: Date;
  signataires: {
    nom: string;
    telephone: string;
    email: string | null;
    statut: string;
    signeLe: Date | null;
    adresseIP: string | null;
    navigateurUtilisateur: string | null;
    consentementExplicite: boolean;
  }[];
};

/**
 * Docs/palier-4-*, section 2 : "une fois tous les signataires passés à
 * SIGNE, un certificat d'audit (résumé lisible de qui a signé, quand, avec
 * quelles preuves) est généré et joint au document final — c'est ce
 * certificat, pas seulement le PDF signé, qui constitue la preuve en cas de
 * litige." Généré à la demande plutôt que stocké comme un Document séparé
 * (déviation MVP documentée dans docs/palier-4-*, section "écarts réels") :
 * les données sources (empreinte, journal d'audit par signataire) sont déjà
 * immuables une fois SIGNE, donc reconstruire ce résumé à l'affichage donne
 * exactement le même résultat qu'un PDF généré une fois et stocké.
 */
export async function construireCertificatAudit(tx: TransactionDrizzle, demandeSignatureId: string): Promise<CertificatAudit | null> {
  const [ligne] = await tx
    .select({
      demandeId: demandeSignature.id,
      nomDocument: document.nom,
      empreinteDocument: demandeSignature.empreinteDocument,
      statut: demandeSignature.statut,
      creeLe: demandeSignature.creeLe,
      creeParNom: utilisateur.nomComplet,
    })
    .from(demandeSignature)
    .innerJoin(document, eq(demandeSignature.documentId, document.id))
    .innerJoin(utilisateur, eq(demandeSignature.creeParId, utilisateur.id))
    .where(eq(demandeSignature.id, demandeSignatureId));

  if (!ligne) return null;

  const signataires = await tx
    .select({
      nom: signataire.nom,
      telephone: signataire.telephone,
      email: signataire.email,
      statut: signataire.statut,
      signeLe: signataire.signeLe,
      adresseIP: signataire.adresseIP,
      navigateurUtilisateur: signataire.navigateurUtilisateur,
      consentementExplicite: signataire.consentementExplicite,
    })
    .from(signataire)
    .where(eq(signataire.demandeSignatureId, demandeSignatureId));

  return { ...ligne, signataires };
}
