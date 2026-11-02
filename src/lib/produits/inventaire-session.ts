import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { TransactionDrizzle } from "@/db/client";
import { depot, inventaireComptage, inventaireSession, produit, stockDepot, utilisateur } from "@/db/schema";
import { m } from "@/lib/i18n/catalogue";
import { assurerDepotPrincipal, resorberEcart } from "./depots";
import { corrigerStock } from "./stock";

/**
 * Inventaire par sessions. Plusieurs personnes comptent en parallèle dans une même session ; rien ne bouge dans le stock avant la
 * validation par un responsable. À chaque comptage on fige le stock du dépôt à cet instant (`quantite_theorique`) : la correction
 * appliquée à la validation est l'écart constaté à ce moment-là, reporté sur le stock du jour, donc une vente faite pendant le
 * comptage n'est ni perdue ni comptée deux fois. Les produits non comptés ne sont pas touchés.
 */

/** Règle pure : la quantité à imposer au dépôt à la validation, pour que l'écart constaté au comptage soit seul corrigé. Jamais négative. */
export function quantiteACorriger(comptee: number, theorique: number, actuelle: number): number {
  return Math.max(0, comptee + (actuelle - theorique));
}

export type ResultatSession = { ok: true; id?: string } | { ok: false; erreur: string };

export async function quantiteDansDepot(tx: TransactionDrizzle, entrepriseId: string, produitId: string, depotId: string): Promise<number> {
  await resorberEcart(tx, entrepriseId, produitId);
  const [ligne] = await tx.select({ quantite: stockDepot.quantite }).from(stockDepot).where(and(eq(stockDepot.entrepriseId, entrepriseId), eq(stockDepot.produitId, produitId), eq(stockDepot.depotId, depotId)));
  return ligne?.quantite ?? 0;
}

export async function creerSessionInventaire(tx: TransactionDrizzle, entrepriseId: string, utilisateurId: string, nom: string, depotId: string | null): Promise<ResultatSession> {
  const nomPropre = nom.trim().replace(/\s+/g, " ");
  if (nomPropre.length < 2 || nomPropre.length > 80) return { ok: false, erreur: m("Le nom doit faire entre 2 et 80 caractères.") };
  let depotChoisi: string;
  if (depotId) {
    const [d] = await tx.select({ id: depot.id, actif: depot.actif }).from(depot).where(and(eq(depot.id, depotId), eq(depot.entrepriseId, entrepriseId)));
    if (!d) return { ok: false, erreur: m("Dépôt introuvable.") };
    if (!d.actif) return { ok: false, erreur: m("Un dépôt archivé ne peut pas recevoir ni envoyer de stock.") };
    depotChoisi = d.id;
  } else {
    depotChoisi = (await assurerDepotPrincipal(tx, entrepriseId)).id;
  }
  const [s] = await tx.insert(inventaireSession).values({ entrepriseId, nom: nomPropre, depotId: depotChoisi, creeParId: utilisateurId }).returning({ id: inventaireSession.id });
  return { ok: true, id: s.id };
}

/** Enregistre (ou remplace) le comptage d'un produit dans une session ouverte ; `quantite` nulle retire le comptage. */
export async function enregistrerComptage(tx: TransactionDrizzle, entrepriseId: string, utilisateurId: string, sessionId: string, produitId: string, quantite: number | null): Promise<ResultatSession> {
  const [session] = await tx.select({ statut: inventaireSession.statut, depotId: inventaireSession.depotId }).from(inventaireSession).where(and(eq(inventaireSession.id, sessionId), eq(inventaireSession.entrepriseId, entrepriseId)));
  if (!session) return { ok: false, erreur: m("Inventaire introuvable.") };
  if (session.statut !== "OUVERT") return { ok: false, erreur: m("Cet inventaire est terminé : on ne peut plus y compter.") };

  if (quantite === null) {
    await tx.delete(inventaireComptage).where(and(eq(inventaireComptage.sessionId, sessionId), eq(inventaireComptage.produitId, produitId), eq(inventaireComptage.entrepriseId, entrepriseId)));
    return { ok: true };
  }
  if (!Number.isInteger(quantite) || quantite < 0 || quantite > 10_000_000) return { ok: false, erreur: m("La quantité comptée doit être un nombre entier, zéro ou plus.") };
  const [p] = await tx.select({ id: produit.id }).from(produit).where(and(eq(produit.id, produitId), eq(produit.entrepriseId, entrepriseId), eq(produit.type, "BIEN"), eq(produit.suiviStock, true)));
  if (!p) return { ok: false, erreur: m("Le suivi du stock n'est pas activé pour ce produit.") };

  const theorique = await quantiteDansDepot(tx, entrepriseId, produitId, session.depotId);
  await tx
    .insert(inventaireComptage)
    .values({ entrepriseId, sessionId, produitId, quantiteComptee: quantite, quantiteTheorique: theorique, comptePar: utilisateurId })
    .onConflictDoUpdate({ target: [inventaireComptage.sessionId, inventaireComptage.produitId], set: { quantiteComptee: quantite, quantiteTheorique: theorique, comptePar: utilisateurId, compteLe: sql`now()` } });
  return { ok: true };
}

export type LigneComptage = {
  produitId: string;
  nom: string;
  stockDepot: number;
  coutMoyen: number;
  codeBarres: string | null;
  quantiteComptee: number | null;
  quantiteTheorique: number | null;
  ecart: number | null;
  comptePar: string | null;
  compteLe: Date | null;
};

export type VueSession = {
  session: { id: string; nom: string; statut: "OUVERT" | "VALIDE" | "ANNULE"; depotId: string; depotNom: string; creeLe: Date; creeParNom: string | null; termineLe: Date | null; nombreCorriges: number | null };
  lignes: LigneComptage[];
};

export async function lireSessionInventaire(tx: TransactionDrizzle, entrepriseId: string, sessionId: string): Promise<VueSession | null> {
  const [s] = await tx
    .select({ id: inventaireSession.id, nom: inventaireSession.nom, statut: inventaireSession.statut, depotId: inventaireSession.depotId, depotNom: depot.nom, creeLe: inventaireSession.creeLe, creePar: inventaireSession.creeParId, termineLe: inventaireSession.termineLe, nombreCorriges: inventaireSession.nombreCorriges })
    .from(inventaireSession)
    .innerJoin(depot, eq(inventaireSession.depotId, depot.id))
    .where(and(eq(inventaireSession.id, sessionId), eq(inventaireSession.entrepriseId, entrepriseId)));
  if (!s) return null;
  const [createur] = await tx.select({ nom: utilisateur.nomComplet }).from(utilisateur).where(and(eq(utilisateur.id, s.creePar), eq(utilisateur.entrepriseId, entrepriseId)));

  const produits = await tx
    .select({ id: produit.id, nom: produit.nom, coutMoyen: produit.coutMoyen, codeBarres: produit.codeBarres })
    .from(produit)
    .where(and(eq(produit.entrepriseId, entrepriseId), eq(produit.type, "BIEN"), eq(produit.suiviStock, true)))
    .orderBy(asc(produit.nom));
  const [quantites, comptages, auteurs] = await Promise.all([
    tx.select({ produitId: stockDepot.produitId, quantite: stockDepot.quantite }).from(stockDepot).where(and(eq(stockDepot.entrepriseId, entrepriseId), eq(stockDepot.depotId, s.depotId))),
    tx.select().from(inventaireComptage).where(and(eq(inventaireComptage.sessionId, sessionId), eq(inventaireComptage.entrepriseId, entrepriseId))),
    tx.select({ id: utilisateur.id, nom: utilisateur.nomComplet }).from(utilisateur).where(eq(utilisateur.entrepriseId, entrepriseId)),
  ]);
  const qParProduit = new Map(quantites.map((q) => [q.produitId, q.quantite]));
  const cParProduit = new Map(comptages.map((c) => [c.produitId, c]));
  const noms = new Map(auteurs.map((a) => [a.id, a.nom]));

  const lignes = produits.map((p) => {
    const c = cParProduit.get(p.id);
    return {
      produitId: p.id,
      nom: p.nom,
      stockDepot: qParProduit.get(p.id) ?? 0,
      coutMoyen: p.coutMoyen,
      codeBarres: p.codeBarres,
      quantiteComptee: c?.quantiteComptee ?? null,
      quantiteTheorique: c?.quantiteTheorique ?? null,
      ecart: c ? c.quantiteComptee - c.quantiteTheorique : null,
      comptePar: c ? (noms.get(c.comptePar) ?? null) : null,
      compteLe: c?.compteLe ?? null,
    };
  });
  return { session: { id: s.id, nom: s.nom, statut: s.statut, depotId: s.depotId, depotNom: s.depotNom, creeLe: s.creeLe, creeParNom: createur?.nom ?? null, termineLe: s.termineLe, nombreCorriges: s.nombreCorriges }, lignes };
}

export async function listerSessionsInventaire(tx: TransactionDrizzle, entrepriseId: string) {
  return tx
    .select({ id: inventaireSession.id, nom: inventaireSession.nom, statut: inventaireSession.statut, creeLe: inventaireSession.creeLe, depotNom: depot.nom, nombreCorriges: inventaireSession.nombreCorriges, comptes: sql<number>`(select count(*)::int from inventaire_comptage c where c.session_id = ${inventaireSession.id})` })
    .from(inventaireSession)
    .innerJoin(depot, eq(inventaireSession.depotId, depot.id))
    .where(eq(inventaireSession.entrepriseId, entrepriseId))
    .orderBy(desc(inventaireSession.creeLe))
    .limit(50);
}

export type ResultatValidation = { ok: true; corriges: number; inchanges: number } | { ok: false; erreur: string };

/**
 * Valide la session : applique chaque écart constaté (corrigerStock en mode inventaire, une ligne « Inventaire » dans l'historique du
 * produit, avec le nom de la session). Verrouille la session (`FOR UPDATE`) : deux validations simultanées n'en passent qu'une.
 * Tout ou rien (une seule transaction). Le droit de valider est revérifié par l'appelant.
 */
export async function validerSessionInventaire(tx: TransactionDrizzle, entrepriseId: string, utilisateurId: string, sessionId: string): Promise<ResultatValidation> {
  const [session] = await tx
    .select({ nom: inventaireSession.nom, statut: inventaireSession.statut, depotId: inventaireSession.depotId })
    .from(inventaireSession)
    .where(and(eq(inventaireSession.id, sessionId), eq(inventaireSession.entrepriseId, entrepriseId)))
    .for("update");
  if (!session) return { ok: false, erreur: m("Inventaire introuvable.") };
  if (session.statut !== "OUVERT") return { ok: false, erreur: m("Cet inventaire est déjà terminé.") };

  const comptages = await tx.select().from(inventaireComptage).where(and(eq(inventaireComptage.sessionId, sessionId), eq(inventaireComptage.entrepriseId, entrepriseId)));
  if (comptages.length === 0) return { ok: false, erreur: m("Aucun produit n'a encore été compté.") };

  let corriges = 0;
  let inchanges = 0;
  for (const c of comptages) {
    const actuelle = await quantiteDansDepot(tx, entrepriseId, c.produitId, session.depotId);
    const cible = quantiteACorriger(c.quantiteComptee, c.quantiteTheorique, actuelle);
    const r = await corrigerStock(tx, entrepriseId, c.produitId, { mode: "INVENTAIRE", compte: cible, note: `Inventaire « ${session.nom} »`, depotId: session.depotId }, utilisateurId);
    if (!r.ok) throw new Error(`Validation de l'inventaire impossible : ${r.erreur}`);
    if (r.ecart === 0) inchanges++;
    else corriges++;
  }
  await tx.update(inventaireSession).set({ statut: "VALIDE", termineParId: utilisateurId, termineLe: new Date(), nombreCorriges: corriges }).where(eq(inventaireSession.id, sessionId));
  return { ok: true, corriges, inchanges };
}

/** Abandonne une session ouverte : aucun stock n'a bougé, les comptages restent consultables. */
export async function annulerSessionInventaire(tx: TransactionDrizzle, entrepriseId: string, utilisateurId: string, sessionId: string): Promise<ResultatSession> {
  const modifies = await tx
    .update(inventaireSession)
    .set({ statut: "ANNULE", termineParId: utilisateurId, termineLe: new Date() })
    .where(and(eq(inventaireSession.id, sessionId), eq(inventaireSession.entrepriseId, entrepriseId), eq(inventaireSession.statut, "OUVERT")))
    .returning({ id: inventaireSession.id });
  if (modifies.length === 0) return { ok: false, erreur: m("Inventaire introuvable ou déjà terminé.") };
  return { ok: true };
}
