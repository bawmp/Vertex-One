import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { tentativePaiementAbonnement, tentativePaiementFacture } from "@/db/schema";
import type { ResultatVerification } from "@/lib/paiement/types";

type Relire = (idTentative: string) => Promise<unknown>;

/**
 * Aide de test : ElyonPay n'envoie aucun webhook pour un paiement direct, la confirmation passe par la relecture active
 * (`relireEtConfirmerFacture` / `relireEtConfirmerAbonnement`). Ce relecteur reproduit ce qu'un sondage ferait : il demande au prestataire simulé
 * (`verifier`) de quelle tentative il s'agit (champ `referenceExterne`, « fac_… » ou « abo_… »), donne un identifiant de transaction à cette tentative
 * si elle n'en a pas, puis lance la vraie relecture. Seul l'appel réseau est simulé : base, RLS, règlements et écritures comptables sont réels.
 */
export function relecteur(verifier: (identifiant: string) => Promise<ResultatVerification>, relireFacture: Relire, relireAbonnement: Relire) {
  return async (entree: { payToken: string }) => {
    const v = await verifier(entree.payToken);
    const reference = v.referenceExterne ?? "";
    const nature = reference.startsWith("fac_") ? "FACTURE" : reference.startsWith("abo_") ? "ABONNEMENT" : null;
    if (!nature) return { code: 404 };
    const id = reference.slice(4);
    if (nature === "FACTURE") {
      const [t] = await db.select().from(tentativePaiementFacture).where(eq(tentativePaiementFacture.id, id));
      if (!t) return { code: 200 };
      if (!t.payToken) await avecEntreprise(t.entrepriseId, (tx) => tx.update(tentativePaiementFacture).set({ payToken: entree.payToken }).where(eq(tentativePaiementFacture.id, id)));
      await relireFacture(id);
    } else {
      const [t] = await db.select().from(tentativePaiementAbonnement).where(eq(tentativePaiementAbonnement.id, id));
      if (!t) return { code: 200 };
      if (!t.payToken) await avecEntreprise(t.entrepriseId, (tx) => tx.update(tentativePaiementAbonnement).set({ payToken: entree.payToken }).where(eq(tentativePaiementAbonnement.id, id)));
      await relireAbonnement(id);
    }
    return { code: 200 };
  };
}
