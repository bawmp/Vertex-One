import { eq, and, lt, notInArray, inArray } from "drizzle-orm";
import type { TransactionDrizzle } from "@/db/client";
import { facture, prospect, entreprise } from "@/db/schema";
import { envoyerEmail } from "@/lib/email/client";
import { gabaritRelanceFacture } from "@/lib/email/gabarits";

export type ResultatRelance = {
  factureId: string;
  numero: string;
  canal: "email" | "whatsapp";
  envoye: boolean;
  erreur?: string;
};

/**
 * Docs/palier-1-*, section 6, étape 6 — à appeler quotidiennement par la
 * file d'attente Postgres (graphile-worker, pas encore installée dans ce
 * projet : le déclenchement planifié est différé, cette fonction est prête
 * à être branchée dessus). Fait passer en EN_RETARD les factures dont
 * l'échéance est dépassée sans paiement complet, et envoie une relance par
 * email (et par WhatsApp — non implémenté, API Meta Cloud non configurée,
 * même traitement que Migadu/NotchPay/Resend avant configuration).
 *
 * Disponible pour tous les forfaits, y compris Starter — la relance ne
 * dépend pas de disponible("PAIEMENTS_EN_LIGNE") (docs/palier-1-*, section 6).
 */
export async function marquerFacturesEnRetard(tx: TransactionDrizzle, entrepriseId: string): Promise<ResultatRelance[]> {
  const enRetard = await tx
    .update(facture)
    .set({ statut: "EN_RETARD" })
    .where(
      and(
        eq(facture.entrepriseId, entrepriseId),
        lt(facture.dateEcheance, new Date()),
        notInArray(facture.statut, ["PAYEE", "ANNULEE", "EN_RETARD"])
      )
    )
    .returning({ id: facture.id, numero: facture.numero, montantTTC: facture.montantTTC, dateEcheance: facture.dateEcheance, prospectId: facture.prospectId });

  if (enRetard.length === 0) return [];

  const [monEntreprise] = await tx.select({ nom: entreprise.nom }).from(entreprise).where(eq(entreprise.id, entrepriseId));
  const prospects = await tx
    .select({ id: prospect.id, nom: prospect.nom, email: prospect.email, telephone: prospect.telephone })
    .from(prospect)
    .where(inArray(prospect.id, enRetard.map((f) => f.prospectId)));
  const prospectParId = new Map(prospects.map((p) => [p.id, p]));

  const resultats: ResultatRelance[] = [];

  for (const f of enRetard) {
    const leProspect = prospectParId.get(f.prospectId);
    if (!leProspect) continue;

    if (leProspect.email) {
      const { subject, html } = gabaritRelanceFacture({
        nomClient: leProspect.nom,
        numeroFacture: f.numero,
        montantTTC: f.montantTTC,
        dateEcheance: f.dateEcheance,
        nomEntreprise: monEntreprise.nom,
      });
      const { envoye, erreur } = await envoyerEmail({ to: leProspect.email, subject, html });
      resultats.push({ factureId: f.id, numero: f.numero, canal: "email", envoye, erreur });
    }

    // TODO Palier 1 : relance WhatsApp via l'API Cloud WhatsApp Business
    // (Meta) — différée faute de jeton configuré, même traitement que les
    // autres intégrations externes de ce projet.
    resultats.push({ factureId: f.id, numero: f.numero, canal: "whatsapp", envoye: false, erreur: "Non implémenté" });
  }

  return resultats;
}
