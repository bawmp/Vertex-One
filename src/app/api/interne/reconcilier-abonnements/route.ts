import { NextResponse } from "next/server";
import { and, isNotNull, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { tentativePaiementAbonnement } from "@/db/schema";
import { relireEtConfirmerAbonnement } from "@/lib/paiement/confirmation";

/**
 * Réconciliation SERVEUR des paiements d'abonnement encore EN_ATTENTE (2026-09-23) — appelée toutes les minutes par
 * le worker (voir crontab, src/worker/tasks/reconcilier-abonnements.ts), jamais par le navigateur. Complète le
 * sondage client (bouton-paiement-abonnement.tsx) plutôt que de le remplacer : un paiement réellement confirmé chez
 * Aangaraa Pay pendant que l'onglet du client est déchargé (constaté en réel — comportement des navigateurs
 * mobiles quand on bascule vers l'app Mobile Money pour valider) doit finir par se refléter ici, même si personne
 * ne regarde l'écran de paiement à ce moment précis.
 *
 * Réutilise EXACTEMENT relireEtConfirmerAbonnement() (@/lib/paiement/confirmation, même fonction que le sondage
 * client) — aucune règle métier dupliquée. Le worker n'importe jamais ce module directement : il transite par
 * "server-only" (protection contre une fuite de app_key dans un bundle client), incompatible avec une exécution
 * tsx/node hors Next.js — cette route existe pour cette seule raison, sur le modèle du webhook de notification.
 *
 * Protégée par un secret partagé (WORKER_INTERNAL_SECRET, distinct de tout secret de paiement) — jamais accessible
 * sans lui, pour qu'une requête externe ne puisse pas déclencher un balayage à volonté.
 */
export async function POST(requete: Request) {
  const secretAttendu = process.env.WORKER_INTERNAL_SECRET;
  if (!secretAttendu) return NextResponse.json({ erreur: "WORKER_INTERNAL_SECRET non configuré" }, { status: 500 });

  const autorisation = requete.headers.get("authorization");
  if (autorisation !== `Bearer ${secretAttendu}`) return NextResponse.json({ erreur: "non autorisé" }, { status: 401 });

  const enAttente = await db
    .select({ id: tentativePaiementAbonnement.id })
    .from(tentativePaiementAbonnement)
    .where(and(eq(tentativePaiementAbonnement.statut, "EN_ATTENTE"), isNotNull(tentativePaiementAbonnement.payToken)));

  const resultats = await Promise.all(
    enAttente.map(async (t) => {
      const statut = await relireEtConfirmerAbonnement(t.id);
      return { id: t.id, statut };
    })
  );

  const confirmees = resultats.filter((r) => r.statut === "CONFIRME").length;
  return NextResponse.json({ examinees: resultats.length, confirmees, resultats });
}
