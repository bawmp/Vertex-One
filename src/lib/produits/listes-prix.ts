import { and, asc, eq, sql } from "drizzle-orm";
import type { TransactionDrizzle } from "@/db/client";
import { contact, listePrix, prixListe, produit } from "@/db/schema";
import { m } from "@/lib/i18n/catalogue";
import { nettoyerNomListe, nomListeValide, prixPourListe, prixValide, remiseValide } from "./listes-prix-regles";

export type ResultatListe = { ok: true; id?: string } | { ok: false; erreur: string };

export async function listerListes(tx: TransactionDrizzle, entrepriseId: string) {
  return tx
    .select({
      id: listePrix.id,
      nom: listePrix.nom,
      remisePourcent: listePrix.remisePourcent,
      prixFixes: sql<number>`(select count(*)::int from prix_liste where prix_liste.liste_id = liste_prix.id)`,
      clients: sql<number>`(select count(*)::int from contact where contact.liste_prix_id = liste_prix.id)`,
    })
    .from(listePrix)
    .where(eq(listePrix.entrepriseId, entrepriseId))
    .orderBy(asc(listePrix.nom));
}

/** Une liste et tout le catalogue : prix du catalogue, prix fixe éventuel et prix finalement appliqué par la liste. */
export async function lireListe(tx: TransactionDrizzle, entrepriseId: string, listeId: string) {
  const [liste] = await tx.select().from(listePrix).where(and(eq(listePrix.id, listeId), eq(listePrix.entrepriseId, entrepriseId)));
  if (!liste) return null;
  const produits = await tx
    .select({ id: produit.id, nom: produit.nom, prixVente: produit.prixVente, prixFixe: prixListe.prix })
    .from(produit)
    .leftJoin(prixListe, and(eq(prixListe.produitId, produit.id), eq(prixListe.listeId, liste.id)))
    .where(eq(produit.entrepriseId, entrepriseId))
    .orderBy(asc(produit.nom));
  return { liste, produits: produits.map((p) => ({ ...p, prixApplique: prixPourListe(p.prixVente, liste, p.prixFixe) })) };
}

export async function creerListe(tx: TransactionDrizzle, entrepriseId: string, l: { nom: string; remisePourcent: number }): Promise<ResultatListe> {
  const nom = nettoyerNomListe(l.nom);
  if (!nomListeValide(nom)) return { ok: false, erreur: m("Le nom doit faire entre 2 et 60 caractères.") };
  if (!remiseValide(l.remisePourcent)) return { ok: false, erreur: m("La remise est un pourcentage entier de 0 à 100.") };
  const [existe] = await tx.select({ id: listePrix.id }).from(listePrix).where(and(eq(listePrix.entrepriseId, entrepriseId), eq(listePrix.nom, nom)));
  if (existe) return { ok: false, erreur: m("Une liste porte déjà ce nom.") };
  const [cree] = await tx.insert(listePrix).values({ entrepriseId, nom, remisePourcent: l.remisePourcent }).returning({ id: listePrix.id });
  return { ok: true, id: cree.id };
}

export async function modifierListe(tx: TransactionDrizzle, entrepriseId: string, listeId: string, l: { nom: string; remisePourcent: number }): Promise<ResultatListe> {
  const nom = nettoyerNomListe(l.nom);
  if (!nomListeValide(nom)) return { ok: false, erreur: m("Le nom doit faire entre 2 et 60 caractères.") };
  if (!remiseValide(l.remisePourcent)) return { ok: false, erreur: m("La remise est un pourcentage entier de 0 à 100.") };
  const [liste] = await tx.select({ id: listePrix.id }).from(listePrix).where(and(eq(listePrix.id, listeId), eq(listePrix.entrepriseId, entrepriseId)));
  if (!liste) return { ok: false, erreur: m("Liste de prix introuvable.") };
  const [autre] = await tx.select({ id: listePrix.id }).from(listePrix).where(and(eq(listePrix.entrepriseId, entrepriseId), eq(listePrix.nom, nom)));
  if (autre && autre.id !== listeId) return { ok: false, erreur: m("Une liste porte déjà ce nom.") };
  await tx.update(listePrix).set({ nom, remisePourcent: l.remisePourcent }).where(and(eq(listePrix.id, listeId), eq(listePrix.entrepriseId, entrepriseId)));
  return { ok: true };
}

/** Supprime une liste : ses prix fixes partent avec elle, les clients qui l'utilisaient retrouvent les prix du catalogue. */
export async function supprimerListe(tx: TransactionDrizzle, entrepriseId: string, listeId: string): Promise<ResultatListe> {
  const [liste] = await tx.select({ id: listePrix.id }).from(listePrix).where(and(eq(listePrix.id, listeId), eq(listePrix.entrepriseId, entrepriseId)));
  if (!liste) return { ok: false, erreur: m("Liste de prix introuvable.") };
  await tx.delete(listePrix).where(and(eq(listePrix.id, listeId), eq(listePrix.entrepriseId, entrepriseId)));
  return { ok: true };
}

/** Fixe le prix d'un produit dans la liste ; un prix vide (null) retire le prix fixe (la remise de la liste s'applique alors). */
export async function definirPrixFixe(tx: TransactionDrizzle, entrepriseId: string, listeId: string, produitId: string, prix: number | null): Promise<ResultatListe> {
  const [liste] = await tx.select({ id: listePrix.id }).from(listePrix).where(and(eq(listePrix.id, listeId), eq(listePrix.entrepriseId, entrepriseId)));
  if (!liste) return { ok: false, erreur: m("Liste de prix introuvable.") };
  const [p] = await tx.select({ id: produit.id }).from(produit).where(and(eq(produit.id, produitId), eq(produit.entrepriseId, entrepriseId)));
  if (!p) return { ok: false, erreur: m("Produit introuvable.") };
  if (prix === null) {
    await tx.delete(prixListe).where(and(eq(prixListe.listeId, listeId), eq(prixListe.produitId, produitId), eq(prixListe.entrepriseId, entrepriseId)));
    return { ok: true };
  }
  if (!prixValide(prix)) return { ok: false, erreur: m("Le prix doit être un nombre entier, zéro ou plus.") };
  await tx
    .insert(prixListe)
    .values({ entrepriseId, listeId, produitId, prix })
    .onConflictDoUpdate({ target: [prixListe.listeId, prixListe.produitId], set: { prix } });
  return { ok: true };
}

/** Rattache une liste à un client (null : prix du catalogue). Liste et contact sont relus dans l'entreprise. */
export async function affecterListeAuContact(tx: TransactionDrizzle, entrepriseId: string, contactId: string, listeId: string | null): Promise<ResultatListe> {
  if (listeId !== null) {
    const [liste] = await tx.select({ id: listePrix.id }).from(listePrix).where(and(eq(listePrix.id, listeId), eq(listePrix.entrepriseId, entrepriseId)));
    if (!liste) return { ok: false, erreur: m("Liste de prix introuvable.") };
  }
  const maj = await tx.update(contact).set({ listePrixId: listeId }).where(and(eq(contact.id, contactId), eq(contact.entrepriseId, entrepriseId))).returning({ id: contact.id });
  if (maj.length === 0) return { ok: false, erreur: m("Contact introuvable.") };
  return { ok: true };
}

/**
 * Catalogue tel que ce client le voit : le prix de vente de chaque produit est remplacé par celui de sa liste (prix fixe, sinon remise).
 * Sans liste, le catalogue est renvoyé tel quel. Le prix reste modifiable sur le document : c'est une proposition, pas une contrainte.
 */
export async function produitsAuPrixDuClient<P extends { id: string; prixVente: number }>(tx: TransactionDrizzle, entrepriseId: string, listePrixId: string | null | undefined, produits: P[]): Promise<P[]> {
  if (!listePrixId) return produits;
  const [liste] = await tx.select().from(listePrix).where(and(eq(listePrix.id, listePrixId), eq(listePrix.entrepriseId, entrepriseId)));
  if (!liste) return produits;
  const fixes = await tx.select({ produitId: prixListe.produitId, prix: prixListe.prix }).from(prixListe).where(and(eq(prixListe.listeId, liste.id), eq(prixListe.entrepriseId, entrepriseId)));
  const parProduit = new Map(fixes.map((f) => [f.produitId, f.prix]));
  return produits.map((p) => ({ ...p, prixVente: prixPourListe(p.prixVente, liste, parProduit.get(p.id)) }));
}
