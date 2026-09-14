import type { Task } from "graphile-worker";
import { eq, and } from "drizzle-orm";
import { avecEntreprise } from "@/db/client";
import { entreprise, utilisateur } from "@/db/schema";
import { calculerEtatAbonnement } from "@/lib/abonnement/etat";
import { gabaritAbonnement } from "@/lib/email/gabarits";
import { envoyerEmail } from "@/lib/email/client";

type ChargeAbonnement = { entrepriseId: string };

function urlBase(): string {
  return process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
}

/**
 * Traite une seule entreprise — voir verifier-abonnements.ts pour le
 * déclenchement quotidien. Passe par avecEntreprise() comme tout code
 * applicatif (voir CLAUDE.md, section file d'attente).
 */
const traiterAbonnementEntreprise: Task = async (payload, helpers) => {
  const { entrepriseId } = payload as ChargeAbonnement;

  await avecEntreprise(entrepriseId, async (tx) => {
    const [monEntreprise] = await tx
      .select({
        nom: entreprise.nom,
        statutAbonnement: entreprise.statutAbonnement,
        essaiFinLe: entreprise.essaiFinLe,
        abonnementEcheanceLe: entreprise.abonnementEcheanceLe,
        dernierRappelAbonnementEnvoye: entreprise.dernierRappelAbonnementEnvoye,
      })
      .from(entreprise)
      .where(eq(entreprise.id, entrepriseId));
    if (!monEntreprise) return;

    const { statut, evenement } = calculerEtatAbonnement(
      { essaiFinLe: monEntreprise.essaiFinLe, abonnementEcheanceLe: monEntreprise.abonnementEcheanceLe },
      new Date()
    );

    if (statut !== monEntreprise.statutAbonnement) {
      await tx.update(entreprise).set({ statutAbonnement: statut }).where(eq(entreprise.id, entrepriseId));
      helpers.logger.info(`Abonnement ${entrepriseId} : ${monEntreprise.statutAbonnement} → ${statut}`);
    }

    if (!evenement || evenement === monEntreprise.dernierRappelAbonnementEnvoye) return;

    // Marqué AVANT l'envoi, pas après — un échec d'email (Resend non
    // configuré) ne doit jamais provoquer un rappel renvoyé en boucle chaque
    // jour tant que la phase ne change pas (même précaution que
    // verifierEcheancesContrats(), src/lib/contrats/echeances.ts).
    await tx.update(entreprise).set({ dernierRappelAbonnementEnvoye: evenement }).where(eq(entreprise.id, entrepriseId));

    const admins = await tx
      .select({ email: utilisateur.email })
      .from(utilisateur)
      .where(and(eq(utilisateur.entrepriseId, entrepriseId), eq(utilisateur.role, "ADMIN"), eq(utilisateur.statut, "ACTIF")));

    const { subject, html } = gabaritAbonnement({
      evenement,
      nomEntreprise: monEntreprise.nom,
      dateEcheance: statut === "essai" ? monEntreprise.essaiFinLe : monEntreprise.abonnementEcheanceLe,
      lienPaiement: `${urlBase()}/app/parametres/abonnement`,
    });

    for (const admin of admins) {
      const { envoye, erreur } = await envoyerEmail({ to: admin.email, subject, html });
      if (!envoye) helpers.logger.warn(`Échec d'envoi du rappel d'abonnement à ${admin.email}`, { erreur });
    }
  });
};

export default traiterAbonnementEntreprise;
