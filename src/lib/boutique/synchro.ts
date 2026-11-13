import { m } from "@/lib/i18n/catalogue";
import { and, asc, eq, isNotNull, isNull, ne, sql } from "drizzle-orm";
import { avecEntreprise, type TransactionDrizzle } from "@/db/client";
import { connexionBoutique, produit, stockPousse } from "@/db/schema";
import { annulerCommandeSite, depotDeLaConnexion, disponiblesDansLeDepot, enregistrerCommandeSite } from "@/lib/api-externe/stock-site";
import { chiffrerConfig, dechiffrerConfig } from "./chiffrement";
import { creerAppeleur, ErreurSite, normaliserAdresse } from "./adresse-sure";
import { creerAdaptateurWooCommerce } from "./woocommerce";
import { ErreurPlateforme, type Adaptateur, type CommandeExterne } from "./types";

/**
 * Moteur de synchronisation d'une boutique connectée automatiquement (2026-11-12). Vertex One est LE stock :
 *  1. il va chercher les commandes du site modifiées depuis le dernier passage et les enregistre (le stock sort, ou revient pour une
 *     annulation) — idempotent par numéro de commande, donc relire deux fois la même commande ne coûte rien ;
 *  2. puis il envoie au site le stock disponible de chaque produit RECONNU (même code des deux côtés), seulement s'il a changé.
 * Jamais d'appel réseau à l'intérieur d'une transaction (la base Neon est lente, une transaction ne doit pas attendre un site tiers).
 * Si une commande n'a pas pu être enregistrée, on n'envoie PAS le stock ce tour-là (on écraserait la baisse que le site a déjà faite) et
 * le curseur n'avance pas : le tour suivant recommence au même endroit.
 */

export type FabriqueAdaptateur = (type: string, config: Record<string, string>) => Adaptateur | null;

export const fabriqueReelle: FabriqueAdaptateur = (type, config) => {
  if (type === "WOOCOMMERCE") {
    const adresse = normaliserAdresse(config.adresse ?? "");
    if (!adresse.ok || !config.cle || !config.secret) return null;
    return creerAdaptateurWooCommerce({ base: adresse.adresse.base, cle: config.cle, secret: config.secret }, creerAppeleur(adresse.adresse));
  }
  return null;
};

export type ResultatSynchro = { enregistrees: number; annulees: number; stockEnvoye: number; erreur?: string };

const MESSAGE_ILLISIBLE = m("Les identifiants de votre site ne peuvent plus être lus : reconnectez votre boutique.");
const MESSAGE_COMMANDES_ECHEC = m("Certaines commandes n'ont pas pu être enregistrées : nouvel essai au prochain passage.");
const MESSAGE_INATTENDU = m("Une erreur inattendue est survenue. Réessayez dans quelques minutes.");
const MESSAGE_INTROUVABLE = m("Connexion introuvable.");
const MAX_COMMANDES_PAR_TOUR = 500;

function messageErreur(e: unknown): string {
  if (e instanceof ErreurPlateforme || e instanceof ErreurSite) return e.message;
  console.error("[boutique] synchronisation impossible :", e instanceof Error ? e.message : e);
  return MESSAGE_INATTENDU;
}

/** Le stock disponible de chaque produit suivi qui a un code, tel que le site doit le voir (dépôt de la connexion). */
export async function stockAPublier(tx: TransactionDrizzle, entrepriseId: string, depotId: string | null): Promise<{ produitId: string; code: string; disponible: number }[]> {
  const monDepot = await depotDeLaConnexion(tx, entrepriseId, depotId);
  const lignes = await tx
    .select({ id: produit.id, code: produit.codeBarres, stockActuel: produit.stockActuel })
    .from(produit)
    .where(and(eq(produit.entrepriseId, entrepriseId), eq(produit.suiviStock, true), eq(produit.estKit, false), isNotNull(produit.codeBarres)))
    .orderBy(asc(produit.codeBarres));
  const disponibles = await disponiblesDansLeDepot(tx, entrepriseId, monDepot.id, lignes);
  return lignes.map((l) => ({ produitId: l.id, code: l.code!, disponible: disponibles.get(l.id) ?? 0 }));
}

async function enregistrerErreur(entrepriseId: string, connexionId: string, erreur: string | null, curseur?: string) {
  await avecEntreprise(entrepriseId, (tx) =>
    tx
      .update(connexionBoutique)
      .set({ dernierCycleLe: new Date(), statut: erreur ? "ERREUR" : "ACTIVE", derniereErreur: erreur, ...(curseur ? { curseur } : {}) })
      .where(and(eq(connexionBoutique.id, connexionId), eq(connexionBoutique.entrepriseId, entrepriseId)))
  );
}

async function appliquerCommande(entrepriseId: string, source: { id: string; nom: string; depotId: string | null }, c: CommandeExterne): Promise<"enregistree" | "annulee" | "deja"> {
  const lignes = c.lignes.slice(0, 200).map((l) => ({ code: l.code.slice(0, 100), quantite: Math.min(Math.max(Math.floor(l.quantite), 1), 100_000) }));
  const cle = { id: source.id, nom: source.nom, depotStockId: source.depotId, origine: "connexion" as const };
  return avecEntreprise(entrepriseId, async (tx) => {
    if (c.action === "ANNULER") {
      const r = await annulerCommandeSite(tx, entrepriseId, cle, c.reference.slice(0, 120));
      return !r.introuvable && !r.doublon ? "annulee" : "deja";
    }
    const r = await enregistrerCommandeSite(tx, entrepriseId, cle, { reference: c.reference.slice(0, 120), lignes });
    return r.doublon ? "deja" : "enregistree";
  });
}

/** Un tour complet pour UNE connexion. Ne lance jamais d'exception : tout problème devient un message simple sur la connexion. */
export async function synchroniserConnexion(entrepriseId: string, connexionId: string, options: { fabrique?: FabriqueAdaptateur } = {}): Promise<ResultatSynchro> {
  const resultat: ResultatSynchro = { enregistrees: 0, annulees: 0, stockEnvoye: 0 };
  const fabrique = options.fabrique ?? fabriqueReelle;

  const connexion = await avecEntreprise(entrepriseId, async (tx) =>
    (await tx.select().from(connexionBoutique).where(and(eq(connexionBoutique.id, connexionId), eq(connexionBoutique.entrepriseId, entrepriseId), isNull(connexionBoutique.archiveeLe), ne(connexionBoutique.type, "FICHIER"))))[0]
  );
  if (!connexion) return { ...resultat, erreur: MESSAGE_INTROUVABLE };

  try {
    const config = dechiffrerConfig(connexion.configChiffree);
    const adaptateur = config ? fabrique(connexion.type, config) : null;
    if (!adaptateur) {
      await enregistrerErreur(entrepriseId, connexionId, MESSAGE_ILLISIBLE);
      return { ...resultat, erreur: MESSAGE_ILLISIBLE };
    }

    // 1. Les commandes du site.
    const curseur = connexion.curseur ?? connexion.creeLe.toISOString();
    const { commandes, curseur: nouveauCurseur } = await adaptateur.commandesDepuis(curseur);
    const source = { id: connexion.id, nom: connexion.nom, depotId: connexion.depotId };
    let echecs = 0;
    for (const c of commandes.slice(0, MAX_COMMANDES_PAR_TOUR)) {
      try {
        const r = await appliquerCommande(entrepriseId, source, c);
        if (r === "enregistree") resultat.enregistrees++;
        if (r === "annulee") resultat.annulees++;
      } catch (e) {
        echecs++;
        console.error("[boutique] commande non enregistrée :", e instanceof Error ? e.message : e);
      }
    }
    if (echecs > 0) {
      await enregistrerErreur(entrepriseId, connexionId, MESSAGE_COMMANDES_ECHEC);
      return { ...resultat, erreur: MESSAGE_COMMANDES_ECHEC };
    }
    if (commandes.length > MAX_COMMANDES_PAR_TOUR) {
      // Beaucoup de commandes d'un coup : on traite les premières et le curseur n'avance pas, la suite est reprise au prochain passage.
      await enregistrerErreur(entrepriseId, connexionId, null, curseur);
      return resultat;
    }

    // 2. Le stock vers le site, seulement ce qui a changé et seulement pour les produits reconnus.
    const { aPublier, dejaPousse } = await avecEntreprise(entrepriseId, async (tx) => ({
      aPublier: await stockAPublier(tx, entrepriseId, connexion.depotId),
      dejaPousse: new Map((await tx.select({ id: stockPousse.produitId, q: stockPousse.quantite }).from(stockPousse).where(eq(stockPousse.connexionId, connexionId))).map((l) => [l.id, l.q])),
    }));
    const aChanger = aPublier.filter((p) => dejaPousse.get(p.produitId) !== p.disponible);
    if (aChanger.length > 0) {
      const produitsSite = await adaptateur.produits();
      const idParCode = new Map(produitsSite.map((p) => [p.code.toLowerCase(), p.idExterne]));
      const lots = aChanger.flatMap((p) => {
        const idExterne = idParCode.get(p.code.toLowerCase());
        return idExterne ? [{ idExterne, quantite: p.disponible, produitId: p.produitId }] : [];
      });
      if (lots.length > 0) {
        const { misAJour } = await adaptateur.poserStock(lots.map(({ idExterne, quantite }) => ({ idExterne, quantite })));
        const reussis = new Set(misAJour);
        const memoriser = lots.filter((l) => reussis.has(l.idExterne));
        if (memoriser.length > 0) {
          await avecEntreprise(entrepriseId, (tx) =>
            tx
              .insert(stockPousse)
              .values(memoriser.map((l) => ({ entrepriseId, connexionId, produitId: l.produitId, quantite: l.quantite })))
              .onConflictDoUpdate({ target: [stockPousse.connexionId, stockPousse.produitId], set: { quantite: sql`excluded.quantite`, misAJourLe: new Date() } })
          );
        }
        resultat.stockEnvoye = memoriser.length;
      }
    }

    await enregistrerErreur(entrepriseId, connexionId, null, nouveauCurseur);
    return resultat;
  } catch (e) {
    const message = messageErreur(e);
    await enregistrerErreur(entrepriseId, connexionId, message).catch(() => {});
    return { ...resultat, erreur: message };
  }
}

export type ApercuConnexion = { reconnus: number; sansEquivalentSite: number; sansCodeChezVertexOne: number; exemplesSansEquivalent: string[] };

/**
 * Avant de connecter : ce qui va se passer, en chiffres. « reconnus » = même code des deux côtés (leur stock sera aligné sur Vertex One),
 * « sansEquivalentSite » = produits suivis ici dont le code n'existe pas sur le site, « sansCodeChezVertexOne » = produits du site que
 * Vertex One ne saura pas relier (ils gardent le stock du site).
 */
export async function apercuConnexion(entrepriseId: string, adaptateur: Adaptateur): Promise<ApercuConnexion> {
  const produitsSite = await adaptateur.produits();
  const codesSite = new Set(produitsSite.map((p) => p.code.toLowerCase()));
  const publie = await avecEntreprise(entrepriseId, (tx) => stockAPublier(tx, entrepriseId, null));
  const codesVertex = new Set(publie.map((p) => p.code.toLowerCase()));
  const reconnus = publie.filter((p) => codesSite.has(p.code.toLowerCase()));
  const sansEquivalent = publie.filter((p) => !codesSite.has(p.code.toLowerCase()));
  return {
    reconnus: reconnus.length,
    sansEquivalentSite: sansEquivalent.length,
    sansCodeChezVertexOne: produitsSite.filter((p) => !codesVertex.has(p.code.toLowerCase())).length,
    exemplesSansEquivalent: sansEquivalent.slice(0, 5).map((p) => p.code),
  };
}

export { chiffrerConfig };
