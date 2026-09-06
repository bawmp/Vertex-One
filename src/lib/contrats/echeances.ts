import { eq, and, lt, isNotNull, isNull, inArray, sql } from "drizzle-orm";
import type { TransactionDrizzle } from "@/db/client";
import { contrat, dossier, utilisateur } from "@/db/schema";
import { envoyerEmail } from "@/lib/email/client";

export type ResultatEcheanceContrat = { contratId: string; titre: string; envoye: boolean; erreur?: string };

/**
 * Docs/palier-4-*, section 3 — à appeler quotidiennement (voir crontab et
 * src/worker/tasks/verifier-echeances-contrats*.ts), même mécanique que
 * marquerFacturesEnRetard() (Palier 1) : deux passes indépendantes sur la
 * même table, chacune idempotente si rejouée plusieurs fois.
 */
export async function verifierEcheancesContrats(tx: TransactionDrizzle, entrepriseId: string): Promise<ResultatEcheanceContrat[]> {
  // Passe 1 — un contrat dont la date de fin est dépassée sans avoir été
  // renouvelé/résilié entretemps passe en EXPIRE, indépendamment de l'alerte
  // de préavis ci-dessous.
  await tx
    .update(contrat)
    .set({ statut: "EXPIRE" })
    .where(
      and(
        eq(contrat.entrepriseId, entrepriseId),
        eq(contrat.statut, "ACTIF"),
        isNotNull(contrat.dateFin),
        lt(contrat.dateFin, new Date())
      )
    );

  // Passe 2 — alerte de préavis, une seule fois par contrat
  // (alerteEcheanceEnvoyeeLe non nulle empêche une deuxième alerte le
  // lendemain). Marquée avant l'envoi, pas après : comme pour la relance de
  // facture, un échec d'email (Resend non configuré) ne doit pas provoquer
  // une alerte renvoyée en boucle chaque jour tant que le contrat existe.
  const aAlerter = await tx
    .update(contrat)
    .set({ alerteEcheanceEnvoyeeLe: new Date() })
    .where(
      and(
        eq(contrat.entrepriseId, entrepriseId),
        eq(contrat.statut, "ACTIF"),
        isNotNull(contrat.dateFin),
        isNull(contrat.alerteEcheanceEnvoyeeLe),
        sql`${contrat.dateFin} <= now() + (${contrat.preavisJours} || ' days')::interval`
      )
    )
    .returning({ id: contrat.id, titre: contrat.titre, dateFin: contrat.dateFin, dossierId: contrat.dossierId });

  if (aAlerter.length === 0) return [];

  const dossiers = await tx
    .select({ id: dossier.id, responsableId: dossier.responsableId })
    .from(dossier)
    .where(inArray(dossier.id, aAlerter.map((c) => c.dossierId)));
  const responsableParDossier = new Map(dossiers.map((d) => [d.id, d.responsableId]));

  const idsResponsables = [...new Set(dossiers.map((d) => d.responsableId))];
  const responsables = idsResponsables.length > 0
    ? await tx.select({ id: utilisateur.id, email: utilisateur.email }).from(utilisateur).where(inArray(utilisateur.id, idsResponsables))
    : [];
  const emailParUtilisateur = new Map(responsables.map((u) => [u.id, u.email]));

  const resultats: ResultatEcheanceContrat[] = [];

  for (const c of aAlerter) {
    const responsableId = responsableParDossier.get(c.dossierId);
    const email = responsableId ? emailParUtilisateur.get(responsableId) : undefined;
    if (!email) {
      resultats.push({ contratId: c.id, titre: c.titre, envoye: false, erreur: "Aucun responsable avec email pour ce dossier." });
      continue;
    }

    const dateFinFormatee = c.dateFin ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(c.dateFin) : "date inconnue";
    const { envoye, erreur } = await envoyerEmail({
      to: email,
      subject: `Contrat à échéance : ${c.titre}`,
      html: `<p>Le contrat « ${c.titre} » arrive à échéance le ${dateFinFormatee}.</p><p>Pensez à le renouveler ou à en informer le client.</p>`,
    });
    resultats.push({ contratId: c.id, titre: c.titre, envoye, erreur });
  }

  return resultats;
}
