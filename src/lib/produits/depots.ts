import { and, asc, eq, sql } from "drizzle-orm";
import type { TransactionDrizzle } from "@/db/client";
import { depot, mouvementStock, produit, stockDepot } from "@/db/schema";
import { m } from "@/lib/i18n/catalogue";

/**
 * Dépôts (2026-11-02) : plusieurs lieux de stockage (boutique, entrepôt…). Le dépôt **principal** reçoit les ventes et les achats
 * des documents (devis acceptés, factures, tickets, factures fournisseur) ; les transferts et les corrections choisissent leur dépôt.
 * `produit.stock_actuel` reste le total de tous les dépôts. Toutes les lectures se font sous la protection par entreprise : jamais
 * un dépôt ni un stock d'une autre entreprise.
 */

export type ResultatDepot = { ok: true; id?: string } | { ok: false; erreur: string };

export function nettoyerNomDepot(nom: string): string {
  return nom.replace(/\s+/g, " ").trim();
}

const codeErreur = (e: unknown): string | undefined => {
  const brut = e as { code?: string; cause?: { code?: string } };
  return brut?.code ?? brut?.cause?.code;
};

/** Le dépôt principal de l'entreprise ; créé à la demande (« Dépôt principal ») s'il n'existe pas encore. */
export async function assurerDepotPrincipal(tx: TransactionDrizzle, entrepriseId: string): Promise<{ id: string; nom: string }> {
  const lire = async () => (await tx.select({ id: depot.id, nom: depot.nom }).from(depot).where(and(eq(depot.entrepriseId, entrepriseId), eq(depot.principal, true))))[0];
  const existant = await lire();
  if (existant) return existant;
  // Deux requêtes simultanées peuvent arriver ici : l'index unique partiel garde un seul principal, le perdant relit celui du gagnant.
  await tx.insert(depot).values({ entrepriseId, nom: "Dépôt principal", principal: true }).onConflictDoNothing();
  const apres = await lire();
  if (!apres) throw new Error("Dépôt principal introuvable après création.");
  return apres;
}

export async function listerDepots(tx: TransactionDrizzle, entrepriseId: string, inclureArchives = false) {
  await assurerDepotPrincipal(tx, entrepriseId);
  const lignes = await tx
    .select({ id: depot.id, nom: depot.nom, principal: depot.principal, actif: depot.actif })
    .from(depot)
    .where(inclureArchives ? eq(depot.entrepriseId, entrepriseId) : and(eq(depot.entrepriseId, entrepriseId), eq(depot.actif, true)))
    .orderBy(sql`${depot.principal} desc`, asc(depot.nom));
  return lignes;
}

export async function creerDepot(tx: TransactionDrizzle, entrepriseId: string, nom: string): Promise<ResultatDepot> {
  const intitule = nettoyerNomDepot(nom);
  if (intitule.length < 2 || intitule.length > 60) return { ok: false, erreur: m("Le nom du dépôt doit faire entre 2 et 60 caractères.") };
  await assurerDepotPrincipal(tx, entrepriseId);
  try {
    const [cree] = await tx.transaction((sp) => sp.insert(depot).values({ entrepriseId, nom: intitule }).returning({ id: depot.id }));
    return { ok: true, id: cree.id };
  } catch (e) {
    if (codeErreur(e) === "23505") return { ok: false, erreur: m("Un dépôt porte déjà ce nom.") };
    throw e;
  }
}

export async function renommerDepot(tx: TransactionDrizzle, entrepriseId: string, depotId: string, nom: string): Promise<ResultatDepot> {
  const intitule = nettoyerNomDepot(nom);
  if (intitule.length < 2 || intitule.length > 60) return { ok: false, erreur: m("Le nom du dépôt doit faire entre 2 et 60 caractères.") };
  try {
    const modifies = await tx.transaction((sp) => sp.update(depot).set({ nom: intitule }).where(and(eq(depot.id, depotId), eq(depot.entrepriseId, entrepriseId))).returning({ id: depot.id }));
    return modifies.length === 0 ? { ok: false, erreur: m("Dépôt introuvable.") } : { ok: true };
  } catch (e) {
    if (codeErreur(e) === "23505") return { ok: false, erreur: m("Un dépôt porte déjà ce nom.") };
    throw e;
  }
}

/** Fait d'un dépôt actif le dépôt principal (celui des ventes et achats). L'ancien principal devient un dépôt ordinaire. */
export async function definirDepotPrincipal(tx: TransactionDrizzle, entrepriseId: string, depotId: string): Promise<ResultatDepot> {
  const [cible] = await tx.select({ id: depot.id, actif: depot.actif }).from(depot).where(and(eq(depot.id, depotId), eq(depot.entrepriseId, entrepriseId)));
  if (!cible) return { ok: false, erreur: m("Dépôt introuvable.") };
  if (!cible.actif) return { ok: false, erreur: m("Un dépôt archivé ne peut pas devenir le dépôt principal.") };
  // Dans l'ordre : l'index unique ne tolère jamais deux principaux, même un instant.
  await tx.update(depot).set({ principal: false }).where(and(eq(depot.entrepriseId, entrepriseId), eq(depot.principal, true)));
  await tx.update(depot).set({ principal: true }).where(eq(depot.id, depotId));
  return { ok: true };
}

/** Archive un dépôt vide (aucun produit en stock) qui n'est pas le principal. */
export async function archiverDepot(tx: TransactionDrizzle, entrepriseId: string, depotId: string): Promise<ResultatDepot> {
  const [cible] = await tx.select({ id: depot.id, principal: depot.principal }).from(depot).where(and(eq(depot.id, depotId), eq(depot.entrepriseId, entrepriseId)));
  if (!cible) return { ok: false, erreur: m("Dépôt introuvable.") };
  if (cible.principal) return { ok: false, erreur: m("Le dépôt principal ne peut pas être archivé : choisissez d'abord un autre dépôt principal.") };
  const [plein] = await tx.select({ id: stockDepot.id }).from(stockDepot).where(and(eq(stockDepot.depotId, depotId), sql`${stockDepot.quantite} <> 0`)).limit(1);
  if (plein) return { ok: false, erreur: m("Ce dépôt contient encore du stock : transférez-le ou corrigez-le d'abord.") };
  await tx.update(depot).set({ actif: false }).where(eq(depot.id, depotId));
  return { ok: true };
}

/** Ajoute `delta` à la quantité d'un produit dans un dépôt (la ligne est créée au besoin) et renvoie la nouvelle quantité. */
export async function deplacerStockDepot(tx: TransactionDrizzle, entrepriseId: string, produitId: string, depotId: string, delta: number): Promise<number> {
  const [ligne] = await tx
    .insert(stockDepot)
    .values({ entrepriseId, produitId, depotId, quantite: delta })
    .onConflictDoUpdate({ target: [stockDepot.produitId, stockDepot.depotId], set: { quantite: sql`${stockDepot.quantite} + ${delta}` } })
    .returning({ quantite: stockDepot.quantite });
  return ligne.quantite;
}

/**
 * Résorbe sur le dépôt principal tout écart entre le stock total du produit et la somme de ses dépôts (produit créé ou importé par
 * un ancien code, stock d'avant les dépôts). Garantit que « somme des dépôts = stock total » avant toute lecture ou tout transfert.
 */
export async function resorberEcart(tx: TransactionDrizzle, entrepriseId: string, produitId: string): Promise<void> {
  const [p] = await tx.select({ stock: produit.stockActuel, suivi: produit.suiviStock }).from(produit).where(and(eq(produit.id, produitId), eq(produit.entrepriseId, entrepriseId)));
  if (!p || !p.suivi) return;
  const [somme] = await tx.select({ total: sql<number>`coalesce(sum(${stockDepot.quantite}), 0)::int` }).from(stockDepot).where(eq(stockDepot.produitId, produitId));
  const ecart = p.stock - (somme?.total ?? 0);
  if (ecart === 0) return;
  const principal = await assurerDepotPrincipal(tx, entrepriseId);
  await deplacerStockDepot(tx, entrepriseId, produitId, principal.id, ecart);
}

export type StockDansDepot = { depotId: string; nom: string; principal: boolean; actif: boolean; quantite: number };

/** Répartition du stock d'un produit : tous les dépôts actifs (même à zéro) et les archivés encore non vides. */
export async function stockParDepot(tx: TransactionDrizzle, entrepriseId: string, produitId: string): Promise<StockDansDepot[]> {
  await resorberEcart(tx, entrepriseId, produitId);
  const depots = await listerDepots(tx, entrepriseId, true);
  const quantites = await tx.select({ depotId: stockDepot.depotId, quantite: stockDepot.quantite }).from(stockDepot).where(eq(stockDepot.produitId, produitId));
  const parDepot = new Map(quantites.map((q) => [q.depotId, q.quantite]));
  return depots.map((d) => ({ depotId: d.id, nom: d.nom, principal: d.principal, actif: d.actif, quantite: parDepot.get(d.id) ?? 0 })).filter((d) => d.actif || d.quantite !== 0);
}

export type ResultatTransfert = { ok: true; quantite: number; depuis: string; vers: string } | { ok: false; erreur: string };

/**
 * Transfère `quantite` d'un produit d'un dépôt à un autre : le stock total ne change pas, deux lignes d'historique (sortie puis
 * entrée) racontent le mouvement. Refusé si la quantité dépasse ce que le dépôt de départ contient, si les deux dépôts sont les mêmes,
 * ou si l'un est archivé ou d'une autre entreprise. Le produit est verrouillé le temps du transfert.
 */
export async function transfererStock(tx: TransactionDrizzle, entrepriseId: string, produitId: string, depuisId: string, versId: string, quantite: number, utilisateurId: string, note?: string): Promise<ResultatTransfert> {
  if (!Number.isInteger(quantite) || quantite <= 0) return { ok: false, erreur: m("La quantité doit être un nombre entier supérieur à zéro.") };
  if (depuisId === versId) return { ok: false, erreur: m("Choisissez deux dépôts différents.") };

  const [p] = await tx
    .select({ id: produit.id, type: produit.type, suivi: produit.suiviStock, stock: produit.stockActuel })
    .from(produit)
    .where(and(eq(produit.id, produitId), eq(produit.entrepriseId, entrepriseId)))
    .for("update");
  if (!p) return { ok: false, erreur: m("Produit introuvable.") };
  if (p.type !== "BIEN" || !p.suivi) return { ok: false, erreur: m("Le suivi du stock n'est pas activé pour ce produit.") };

  const [source] = await tx.select({ id: depot.id, nom: depot.nom, actif: depot.actif }).from(depot).where(and(eq(depot.id, depuisId), eq(depot.entrepriseId, entrepriseId)));
  const [cible] = await tx.select({ id: depot.id, nom: depot.nom, actif: depot.actif }).from(depot).where(and(eq(depot.id, versId), eq(depot.entrepriseId, entrepriseId)));
  if (!source || !cible) return { ok: false, erreur: m("Dépôt introuvable.") };
  if (!source.actif || !cible.actif) return { ok: false, erreur: m("Un dépôt archivé ne peut pas recevoir ni envoyer de stock.") };

  await resorberEcart(tx, entrepriseId, produitId);
  const [dispo] = await tx.select({ quantite: stockDepot.quantite }).from(stockDepot).where(and(eq(stockDepot.produitId, produitId), eq(stockDepot.depotId, depuisId)));
  if ((dispo?.quantite ?? 0) < quantite) return { ok: false, erreur: m("Le dépôt de départ ne contient pas assez de ce produit.") };

  await deplacerStockDepot(tx, entrepriseId, produitId, depuisId, -quantite);
  await deplacerStockDepot(tx, entrepriseId, produitId, versId, quantite);
  const remarque = note?.trim() || null;
  await tx.insert(mouvementStock).values([
    { entrepriseId, produitId, type: "TRANSFERT_SORTIE", quantite: -quantite, stockApres: p.stock, depotId: depuisId, motif: "TRANSFERT", note: [`Vers ${cible.nom}`, remarque].filter(Boolean).join(" — "), creeParId: utilisateurId },
    { entrepriseId, produitId, type: "TRANSFERT_ENTREE", quantite, stockApres: p.stock, depotId: versId, motif: "TRANSFERT", note: [`Depuis ${source.nom}`, remarque].filter(Boolean).join(" — "), creeParId: utilisateurId },
  ]);
  return { ok: true, quantite, depuis: source.nom, vers: cible.nom };
}

/**
 * Dépôt choisi sur un document (priorité 1.3, 2026-11-02). Vide = le dépôt principal (on stocke alors `null`). Un identifiant fourni doit
 * être un dépôt ACTIF de CETTE entreprise : jamais un dépôt d'une autre, ni un dépôt archivé.
 */
export async function verifierDepotDocument(tx: TransactionDrizzle, entrepriseId: string, depotId: string | undefined): Promise<{ ok: true; depotId: string | null } | { ok: false; erreur: string }> {
  if (!depotId) return { ok: true, depotId: null };
  const [d] = await tx.select({ id: depot.id, actif: depot.actif }).from(depot).where(and(eq(depot.id, depotId), eq(depot.entrepriseId, entrepriseId)));
  if (!d) return { ok: false, erreur: m("Dépôt introuvable.") };
  if (!d.actif) return { ok: false, erreur: m("Un dépôt archivé ne peut pas recevoir ni envoyer de stock.") };
  return { ok: true, depotId: d.id };
}

/** Le dépôt réellement touché au moment du mouvement : celui du document s'il est encore actif, sinon le dépôt principal. */
export async function resoudreDepotDocument(tx: TransactionDrizzle, entrepriseId: string, depotId: string | null | undefined): Promise<string> {
  if (depotId) {
    const [d] = await tx.select({ id: depot.id }).from(depot).where(and(eq(depot.id, depotId), eq(depot.entrepriseId, entrepriseId), eq(depot.actif, true)));
    if (d) return d.id;
  }
  return (await assurerDepotPrincipal(tx, entrepriseId)).id;
}
