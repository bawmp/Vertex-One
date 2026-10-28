"use server";

import { and, desc, eq, inArray } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { avecEntreprise } from "@/db/client";
import { abonnementPush, canalSourdine, preferenceNotification } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { canalAccessible, messagerieDisponible } from "@/lib/messagerie/acces";
import { envoyerEssai, niveauValide, pushConfigure } from "@/lib/messagerie/push";
import { getT } from "@/lib/i18n/langue";

/**
 * Notifications de One Chat : appareils abonnés au push, réglages de la personne et sourdine d'un canal. Toujours pour la
 * personne CONNECTÉE (jamais un identifiant du navigateur) ; la messagerie doit lui être disponible (droit et forfait).
 */

const MAX_APPAREILS = 10;

const schemaAbonnement = z.object({
  endpoint: z
    .string()
    .max(1000)
    .refine((u) => u.startsWith("https://"), "https"),
  keys: z.object({ p256dh: z.string().min(20).max(200), auth: z.string().min(8).max(100) }),
});

export async function enregistrerAbonnementPush(abonnement: unknown, agent: string | null): Promise<{ ok?: true; erreur?: string }> {
  const t = await getT();
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!pushConfigure()) return { erreur: t("Les notifications ne sont pas encore activées sur ce service.") };
  const analyse = schemaAbonnement.safeParse(abonnement);
  if (!analyse.success) return { erreur: t("Abonnement de notification invalide.") };

  return avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    if (!(await messagerieDisponible(tx, utilisateurConnecte))) return { erreur: t("La messagerie n'est pas disponible pour votre compte ou votre forfait.") };
    const { endpoint, keys } = analyse.data;
    const agentPropre = agent ? agent.replace(/[<>]/g, "").slice(0, 160) : null;
    await tx
      .insert(abonnementPush)
      .values({ entrepriseId: utilisateurConnecte.entrepriseId, utilisateurId: utilisateurConnecte.utilisateurId, endpoint, cleP256dh: keys.p256dh, cleAuth: keys.auth, agent: agentPropre })
      // Le même navigateur peut changer de compte : l'appareil appartient alors à la personne connectée.
      .onConflictDoUpdate({
        target: [abonnementPush.entrepriseId, abonnementPush.endpoint],
        set: { utilisateurId: utilisateurConnecte.utilisateurId, cleP256dh: keys.p256dh, cleAuth: keys.auth, agent: agentPropre },
      });

    // Au plus MAX_APPAREILS appareils par personne : les plus anciens sont retirés.
    const siens = await tx
      .select({ id: abonnementPush.id })
      .from(abonnementPush)
      .where(and(eq(abonnementPush.entrepriseId, utilisateurConnecte.entrepriseId), eq(abonnementPush.utilisateurId, utilisateurConnecte.utilisateurId)))
      .orderBy(desc(abonnementPush.creeLe));
    const trop = siens.slice(MAX_APPAREILS).map((s) => s.id);
    if (trop.length > 0) await tx.delete(abonnementPush).where(and(eq(abonnementPush.entrepriseId, utilisateurConnecte.entrepriseId), inArray(abonnementPush.id, trop)));
    return { ok: true as const };
  });
}

/** Retire un appareil de la personne connectée (désactivation, ou déconnexion de cet appareil). */
export async function supprimerAbonnementPush(endpoint: string): Promise<{ ok?: true }> {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) return {};
  await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) =>
    tx
      .delete(abonnementPush)
      .where(and(eq(abonnementPush.entrepriseId, utilisateurConnecte.entrepriseId), eq(abonnementPush.utilisateurId, utilisateurConnecte.utilisateurId), eq(abonnementPush.endpoint, String(endpoint).slice(0, 1000))))
  );
  return { ok: true };
}

const schemaReglages = z.object({ niveau: z.string().refine(niveauValide), son: z.boolean(), apercu: z.boolean() });

export async function enregistrerReglagesNotification(valeurs: unknown): Promise<{ ok?: true; erreur?: string }> {
  const t = await getT();
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  const analyse = schemaReglages.safeParse(valeurs);
  if (!analyse.success) return { erreur: t("Réglage invalide.") };
  return avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    if (!(await messagerieDisponible(tx, utilisateurConnecte))) return { erreur: t("La messagerie n'est pas disponible pour votre compte ou votre forfait.") };
    await tx
      .insert(preferenceNotification)
      .values({ entrepriseId: utilisateurConnecte.entrepriseId, utilisateurId: utilisateurConnecte.utilisateurId, niveau: analyse.data.niveau, son: analyse.data.son, apercu: analyse.data.apercu })
      .onConflictDoUpdate({ target: preferenceNotification.utilisateurId, set: { niveau: analyse.data.niveau, son: analyse.data.son, apercu: analyse.data.apercu, misAJourLe: new Date() } });
    return { ok: true as const };
  });
}

/** Met en sourdine (ou rétablit) un canal que la personne peut voir. Renvoie l'état après l'opération. */
export async function basculerSourdineCanal(canalId: string): Promise<{ sourdine?: boolean; erreur?: string }> {
  const t = await getT();
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  return avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const leCanal = await canalAccessible(tx, utilisateurConnecte, canalId);
    if (!leCanal) return { erreur: t("Ce canal est introuvable.") };
    const condition = and(eq(canalSourdine.entrepriseId, utilisateurConnecte.entrepriseId), eq(canalSourdine.utilisateurId, utilisateurConnecte.utilisateurId), eq(canalSourdine.canalId, canalId));
    const [existe] = await tx.select({ id: canalSourdine.id }).from(canalSourdine).where(condition);
    if (existe) {
      await tx.delete(canalSourdine).where(condition);
      return { sourdine: false };
    }
    await tx.insert(canalSourdine).values({ entrepriseId: utilisateurConnecte.entrepriseId, utilisateurId: utilisateurConnecte.utilisateurId, canalId }).onConflictDoNothing();
    return { sourdine: true };
  });
}

/** Envoie une notification d'essai aux appareils de la personne : elle voit tout de suite si ça marche. */
export async function envoyerNotificationEssai(): Promise<{ envoyes?: number; appareils?: number; erreur?: string }> {
  const t = await getT();
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!pushConfigure()) return { erreur: t("Les notifications ne sont pas encore activées sur ce service.") };
  const resultat = await envoyerEssai(utilisateurConnecte.entrepriseId, utilisateurConnecte.utilisateurId);
  return resultat;
}
