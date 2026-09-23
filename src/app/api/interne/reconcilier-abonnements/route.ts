import { NextResponse } from "next/server";
import { and, isNotNull, eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, tentativePaiementAbonnement } from "@/db/schema";
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
 * ⚠️ Bug réel corrigé le 2026-09-23 : une première version lisait `tentative_paiement_abonnement` directement via
 * `db.select()`, SANS passer par avecEntreprise() — la requête tournait donc avec `app.entreprise_id` jamais posé,
 * et ne remontait silencieusement AUCUNE ligne (RLS active), malgré de vrais paiements confirmés côté Aangaraa Pay
 * en attente. Corrigé en reprenant EXACTEMENT le patron déjà établi ailleurs dans ce projet (verifier-abonnements.ts
 * → traiter-abonnement-entreprise.ts) : la table `entreprise` elle-même n'a pas de RLS (lue librement pour lister
 * les tenants), puis chaque lecture de `tentative_paiement_abonnement` passe par avecEntreprise(), une entreprise à
 * la fois — jamais un balayage direct multi-tenant sur une table protégée.
 *
 * Protégée par un secret partagé (WORKER_INTERNAL_SECRET, distinct de tout secret de paiement) — jamais accessible
 * sans lui, pour qu'une requête externe ne puisse pas déclencher un balayage à volonté.
 */
export async function POST(requete: Request) {
  const secretAttendu = process.env.WORKER_INTERNAL_SECRET;
  if (!secretAttendu) return NextResponse.json({ erreur: "WORKER_INTERNAL_SECRET non configuré" }, { status: 500 });

  const autorisation = requete.headers.get("authorization");
  if (autorisation !== `Bearer ${secretAttendu}`) return NextResponse.json({ erreur: "non autorisé" }, { status: 401 });

  const entreprises = await db.select({ id: entreprise.id }).from(entreprise);

  const resultats: { entrepriseId: string; id: string; statut: string }[] = [];
  for (const e of entreprises) {
    const enAttente = await avecEntreprise(e.id, (tx) =>
      tx
        .select({ id: tentativePaiementAbonnement.id })
        .from(tentativePaiementAbonnement)
        .where(and(eq(tentativePaiementAbonnement.statut, "EN_ATTENTE"), isNotNull(tentativePaiementAbonnement.payToken)))
    );
    for (const t of enAttente) {
      const statut = await relireEtConfirmerAbonnement(t.id);
      resultats.push({ entrepriseId: e.id, id: t.id, statut });
    }
  }

  const confirmees = resultats.filter((r) => r.statut === "CONFIRME").length;
  return NextResponse.json({ examinees: resultats.length, confirmees, resultats });
}
