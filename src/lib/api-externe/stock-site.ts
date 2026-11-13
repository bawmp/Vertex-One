import { z } from "zod";
import { and, asc, desc, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";
import type { TransactionDrizzle } from "@/db/client";
import { commandeSite, depot, mouvementStock, produit, stockDepot } from "@/db/schema";
import { assurerDepotPrincipal, deplacerStockDepot } from "@/lib/produits/depots";
import { reservesParProduit, stockDisponible } from "@/lib/produits/reservations";
import { decrementerStockVente, defaireMouvementsDocument } from "@/lib/produits/stock";

/**
 * Boutique en ligne connectée (2026-11-12) : un site web de l'entreprise (BoOKet, une boutique WooCommerce, un site fait sur mesure…) lit
 * le stock de Vertex One et lui déclare ses commandes. Vertex One reste LE stock : une commande du site fait sortir le stock comme une
 * vente (même historique, mêmes alertes, mêmes dépôts), et une annulation le remet.
 *
 * Le lien entre un article du site et un produit de Vertex One est le CODE-BARRES du produit (champ « Code-barres » de la fiche) : le
 * site envoie son code (ex. ENF-0001), Vertex One retrouve le produit qui porte ce code dans CETTE entreprise.
 *
 * Règles :
 *  - une commande du site n'est JAMAIS refusée pour cause de stock ou de code inconnu : le client a déjà payé ou commandé, le stock réel
 *    prime. Une ligne dont le code est inconnu, ou dont le produit n'est pas suivi, est signalée dans la réponse et dans l'écran de
 *    l'Administrateur, jamais bloquante ;
 *  - idempotent par (clé, référence) : renvoyer la même commande ne fait jamais sortir le stock deux fois ;
 *  - tout est lu et écrit sous la RLS de l'entreprise de la clé, jamais d'un identifiant venu du corps de la requête.
 */

const MAX_LIGNES = 200;
const MAX_PRODUITS_LECTURE = 5000;

export const schemaCommandeSite = z.object({
  reference: z.string().trim().min(1, "« reference » est obligatoire.").max(120, "« reference » est trop longue (120 caractères au plus)."),
  lignes: z
    .array(
      z.object({
        code: z.string().trim().min(1, "Chaque ligne doit avoir un « code ».").max(100, "Un « code » est trop long (100 caractères au plus)."),
        quantite: z.number("Chaque « quantite » doit être un nombre.").int("Chaque « quantite » doit être un entier.").min(1, "Chaque « quantite » doit être d'au moins 1.").max(100_000, "Une « quantite » est trop grande."),
      })
    )
    .min(1, "Au moins une ligne est nécessaire.")
    .max(MAX_LIGNES, `Au plus ${MAX_LIGNES} lignes par commande.`),
});

export const schemaAnnulationSite = z.object({ reference: schemaCommandeSite.shape.reference });

/**
 * D'où vient une commande du site : une clé d'API (le site appelle Vertex One, `origine` absent ou « cle ») ou une connexion automatique
 * (Vertex One va chercher les commandes sur le site : WooCommerce…, ou un import de fichier ; `origine` = « connexion »). Chacune a ses
 * propres références : deux sources peuvent numéroter leurs commandes pareil sans jamais se confondre.
 */
export type CleStock = { id: string; nom: string; depotStockId: string | null; origine?: "cle" | "connexion" };
const sourceDe = (c: CleStock) => (c.origine === "connexion" ? eq(commandeSite.connexionId, c.id) : eq(commandeSite.cleId, c.id));
export type LigneResultat = { code: string; quantite: number; statut: "ok" | "inconnu" | "non_suivi"; nom?: string; disponible?: number };

const enMinuscules = (code: string) => code.trim().toLowerCase();

/** Le dépôt dont le site voit le stock : celui choisi sur la connexion s'il existe encore et est actif, sinon le dépôt principal. */
export async function depotDeLaConnexion(tx: TransactionDrizzle, entrepriseId: string, depotStockId: string | null): Promise<{ id: string; nom: string }> {
  if (depotStockId) {
    const [choisi] = await tx.select({ id: depot.id, nom: depot.nom }).from(depot).where(and(eq(depot.id, depotStockId), eq(depot.entrepriseId, entrepriseId), eq(depot.actif, true)));
    if (choisi) return choisi;
  }
  return assurerDepotPrincipal(tx, entrepriseId);
}

/**
 * Stock DISPONIBLE à la vente (en stock dans le dépôt, moins ce que réservent les commandes client en cours), par produit, sans jamais
 * écrire : le dépôt principal reçoit l'éventuel écart entre le stock total et la somme des dépôts, comme le fait `resorberEcart`.
 */
export async function disponiblesDansLeDepot(tx: TransactionDrizzle, entrepriseId: string, depotId: string, produits: { id: string; stockActuel: number }[]): Promise<Map<string, number>> {
  if (produits.length === 0) return new Map();
  const ids = produits.map((p) => p.id);
  const principal = await assurerDepotPrincipal(tx, entrepriseId);
  const lignes = await tx.select({ produitId: stockDepot.produitId, depotId: stockDepot.depotId, quantite: stockDepot.quantite }).from(stockDepot).where(and(eq(stockDepot.entrepriseId, entrepriseId), inArray(stockDepot.produitId, ids)));
  const parProduit = new Map<string, { sommeAutres: number; ici: number }>();
  for (const l of lignes) {
    const e = parProduit.get(l.produitId) ?? { sommeAutres: 0, ici: 0 };
    if (l.depotId === depotId) e.ici += l.quantite;
    if (l.depotId !== principal.id) e.sommeAutres += l.quantite;
    parProduit.set(l.produitId, e);
  }
  const reserves = await reservesParProduit(tx, entrepriseId, { depotId, produitIds: ids });
  const resultat = new Map<string, number>();
  for (const p of produits) {
    const e = parProduit.get(p.id) ?? { sommeAutres: 0, ici: 0 };
    // Le principal contient tout ce qui n'est pas rangé ailleurs ; un autre dépôt ne contient que sa propre ligne.
    const enDepot = depotId === principal.id ? p.stockActuel - e.sommeAutres : e.ici;
    resultat.set(p.id, Math.max(0, stockDisponible(enDepot, reserves.get(p.id) ?? 0)));
  }
  return resultat;
}

export type StockSite = { depot: { id: string; nom: string }; produits: { code: string; nom: string; disponible: number }[]; tronque: boolean };

/**
 * Lecture du stock pour le site : les produits SUIVIS qui ont un code-barres (un kit n'a pas de stock à lui, il n'est pas listé). `codes`
 * restreint la lecture à quelques codes (insensible à la casse). `disponible` n'est jamais négatif : une rupture se lit « 0 ».
 */
export async function lireStockSite(tx: TransactionDrizzle, entrepriseId: string, cle: CleStock, codes?: string[]): Promise<StockSite> {
  const monDepot = await depotDeLaConnexion(tx, entrepriseId, cle.depotStockId);
  const conditions = [eq(produit.entrepriseId, entrepriseId), eq(produit.suiviStock, true), eq(produit.estKit, false), isNotNull(produit.codeBarres)];
  if (codes && codes.length > 0) conditions.push(inArray(sql`lower(${produit.codeBarres})`, codes.map(enMinuscules)));
  const lignes = await tx
    .select({ id: produit.id, nom: produit.nom, code: produit.codeBarres, stockActuel: produit.stockActuel })
    .from(produit)
    .where(and(...conditions))
    .orderBy(asc(produit.codeBarres))
    .limit(MAX_PRODUITS_LECTURE + 1);
  const tronque = lignes.length > MAX_PRODUITS_LECTURE;
  const gardees = tronque ? lignes.slice(0, MAX_PRODUITS_LECTURE) : lignes;
  const disponibles = await disponiblesDansLeDepot(tx, entrepriseId, monDepot.id, gardees);
  return { depot: monDepot, produits: gardees.map((p) => ({ code: p.code!, nom: p.nom, disponible: disponibles.get(p.id) ?? 0 })), tronque };
}

export type ResultatCommandeSite = { id: string; doublon: boolean; statut: string; lignes: LigneResultat[] };

/**
 * Enregistre une commande du site : retrouve les produits par code-barres, fait sortir le stock du dépôt de la connexion et garde la
 * commande. Renvoie, pour chaque ligne, son résultat et le stock disponible restant (de quoi mettre à jour l'affichage du site).
 * Sérialisé par un verrou sur (clé, référence) : deux appels simultanés de la même commande ne sortent le stock qu'une fois.
 */
export async function enregistrerCommandeSite(tx: TransactionDrizzle, entrepriseId: string, cle: CleStock, entree: z.infer<typeof schemaCommandeSite>): Promise<ResultatCommandeSite> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${entrepriseId}:cmdsite:${cle.origine ?? "cle"}:${cle.id}:${entree.reference}`}))`);

  const [existante] = await tx.select().from(commandeSite).where(and(sourceDe(cle), eq(commandeSite.reference, entree.reference)));
  const monDepot = await depotDeLaConnexion(tx, entrepriseId, cle.depotStockId);
  if (existante) {
    return { id: existante.id, doublon: true, statut: existante.statut, lignes: await lignesAvecDisponible(tx, entrepriseId, monDepot.id, existante.lignes.map((l) => ({ code: l.code, quantite: l.quantite, statut: l.statut, nom: l.nom })), existante.lignes) };
  }

  // Un même code répété dans la commande compte une seule fois (quantités additionnées), dans l'ordre de première apparition.
  const demandes = new Map<string, { code: string; quantite: number }>();
  for (const l of entree.lignes) {
    const cleLigne = enMinuscules(l.code);
    const deja = demandes.get(cleLigne);
    if (deja) deja.quantite += l.quantite;
    else demandes.set(cleLigne, { code: l.code, quantite: l.quantite });
  }

  const trouves = await tx
    .select({ id: produit.id, nom: produit.nom, code: produit.codeBarres, suivi: produit.suiviStock, estKit: produit.estKit })
    .from(produit)
    .where(and(eq(produit.entrepriseId, entrepriseId), isNotNull(produit.codeBarres), inArray(sql`lower(${produit.codeBarres})`, [...demandes.keys()])));
  const parCode = new Map(trouves.map((p) => [enMinuscules(p.code!), p]));

  const lignesStockees: { code: string; quantite: number; statut: "ok" | "inconnu" | "non_suivi"; produitId?: string; nom?: string }[] = [];
  const asortir: { produitId: string; quantite: number }[] = [];
  for (const [cleLigne, d] of demandes) {
    const p = parCode.get(cleLigne);
    if (!p) {
      lignesStockees.push({ code: d.code, quantite: d.quantite, statut: "inconnu" });
    } else if (!p.suivi && !p.estKit) {
      lignesStockees.push({ code: d.code, quantite: d.quantite, statut: "non_suivi", produitId: p.id, nom: p.nom });
    } else {
      lignesStockees.push({ code: d.code, quantite: d.quantite, statut: "ok", produitId: p.id, nom: p.nom });
      asortir.push({ produitId: p.id, quantite: d.quantite });
    }
  }

  const [commande] = await tx.insert(commandeSite).values({ entrepriseId, ...(cle.origine === "connexion" ? { connexionId: cle.id } : { cleId: cle.id }), source: cle.nom, reference: entree.reference, lignes: lignesStockees }).returning({ id: commandeSite.id });
  // Jamais refusée pour cause de stock : le client a déjà commandé, le stock peut devenir négatif et déclenche alors les alertes habituelles.
  await decrementerStockVente(tx, entrepriseId, asortir, { documentType: "COMMANDE_SITE", documentId: commande.id, utilisateurId: null, depotId: monDepot.id });

  return { id: commande.id, doublon: false, statut: "ENREGISTREE", lignes: await lignesAvecDisponible(tx, entrepriseId, monDepot.id, lignesStockees, lignesStockees) };
}

/** Ajoute à chaque ligne reconnue le stock disponible actuel (les kits, sans stock propre, n'en ont pas). */
async function lignesAvecDisponible(
  tx: TransactionDrizzle,
  entrepriseId: string,
  depotId: string,
  lignes: LigneResultat[],
  sources: { code: string; produitId?: string }[]
): Promise<LigneResultat[]> {
  const ids = sources.map((s) => s.produitId).filter((id): id is string => !!id);
  const produits = ids.length === 0 ? [] : await tx.select({ id: produit.id, stockActuel: produit.stockActuel, suivi: produit.suiviStock, estKit: produit.estKit }).from(produit).where(and(eq(produit.entrepriseId, entrepriseId), inArray(produit.id, ids)));
  const lisibles = produits.filter((p) => p.suivi && !p.estKit);
  const disponibles = await disponiblesDansLeDepot(tx, entrepriseId, depotId, lisibles);
  const idParCode = new Map(sources.map((s) => [s.code, s.produitId]));
  // Seuls les champs prévus sortent : jamais l'identifiant interne d'un produit.
  return lignes.map((l) => {
    const id = idParCode.get(l.code);
    const d = id ? disponibles.get(id) : undefined;
    return { code: l.code, quantite: l.quantite, statut: l.statut, ...(l.nom ? { nom: l.nom } : {}), ...(d !== undefined ? { disponible: d } : {}) };
  });
}

export type ResultatAnnulationSite = { introuvable: true } | { introuvable: false; doublon: boolean; remisEnStock: number };

/** Annule une commande déjà déclarée : les articles sortis reviennent en stock (dans le dépôt d'où ils étaient sortis). Idempotent. */
export async function annulerCommandeSite(tx: TransactionDrizzle, entrepriseId: string, cle: CleStock, reference: string): Promise<ResultatAnnulationSite> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${entrepriseId}:cmdsite:${cle.origine ?? "cle"}:${cle.id}:${reference}`}))`);
  const [commande] = await tx.select().from(commandeSite).where(and(sourceDe(cle), eq(commandeSite.reference, reference)));
  if (!commande) return { introuvable: true };
  if (commande.statut === "ANNULEE") return { introuvable: false, doublon: true, remisEnStock: 0 };
  const defaits = await defaireMouvementsDocument(tx, entrepriseId, "COMMANDE_SITE", commande.id, null);
  await tx.update(commandeSite).set({ statut: "ANNULEE", annuleeLe: new Date() }).where(eq(commandeSite.id, commande.id));
  return { introuvable: false, doublon: false, remisEnStock: defaits };
}

/* ------------------------------------------------------------------ produits déclarés par le site ------------------------------------------------------------------ */

const MAX_PRODUITS_PAR_APPEL = 50;

/**
 * Produits que le site veut voir exister chez Vertex One avec le MÊME code (2026-11-13) : un produit créé plus tard sur le site, ou un produit dont le
 * stock n'est pas chiffré. Création seulement : un code déjà connu (même en majuscules/minuscules différentes) n'est JAMAIS modifié ni écrasé — le
 * produit de Vertex One reste la référence. `stock` renseigné : le produit est suivi, avec ce stock de départ (une ligne « stock initial » ouvre son
 * historique) ; `stock` absent ou nul : le produit est créé SANS suivi de stock, il ne sera relié au stock que quand l'entreprise l'activera.
 */
export const schemaProduitsSite = z.object({
  produits: z
    .array(
      z.object({
        code: z.string("Chaque produit doit avoir un « code ».").trim().min(1, "Chaque produit doit avoir un « code ».").max(100, "Un « code » est trop long (100 caractères au plus)."),
        nom: z.string("Chaque produit doit avoir un « nom ».").trim().min(2, "Chaque produit doit avoir un « nom » (2 caractères au moins).").max(200, "Un « nom » est trop long (200 caractères au plus)."),
        prixVente: z.number().int("Les prix sont des nombres entiers (FCFA).").min(0, "Un prix ne peut pas être négatif.").max(1_000_000_000).optional(),
        prixAchat: z.number().int("Les prix sont des nombres entiers (FCFA).").min(0, "Un prix ne peut pas être négatif.").max(1_000_000_000).optional(),
        description: z.string().trim().max(2000, "Une « description » est trop longue (2000 caractères au plus).").nullish(),
        stock: z.number().int("Le « stock » est un nombre entier.").min(0, "Le « stock » ne peut pas être négatif.").max(10_000_000).nullish(),
        image: z.string().trim().max(500).nullish(),
      })
    )
    .min(1, "Au moins un produit est nécessaire.")
    .max(MAX_PRODUITS_PAR_APPEL, `Au plus ${MAX_PRODUITS_PAR_APPEL} produits par appel.`),
});

export type ResultatProduitSite = { code: string; statut: "cree" | "existant"; suiviStock?: boolean };

export async function declarerProduitsSite(tx: TransactionDrizzle, entrepriseId: string, creeParId: string, entree: z.infer<typeof schemaProduitsSite>): Promise<{ resultats: ResultatProduitSite[]; imagesAChargerNb: number }> {
  const vus = new Set<string>();
  const resultats: ResultatProduitSite[] = [];
  let imagesAChargerNb = 0;
  let principal: { id: string } | null = null;

  for (const p of entree.produits) {
    const cle = enMinuscules(p.code);
    if (vus.has(cle)) continue; // le même code deux fois dans l'appel : une seule création
    vus.add(cle);

    const [existant] = await tx.select({ id: produit.id }).from(produit).where(and(eq(produit.entrepriseId, entrepriseId), isNotNull(produit.codeBarres), sql`lower(${produit.codeBarres}) = ${cle}`)).limit(1);
    if (existant) {
      resultats.push({ code: p.code, statut: "existant" });
      continue;
    }

    const suiviStock = typeof p.stock === "number";
    const prixAchat = p.prixAchat ?? 0;
    const adresseImage = p.image && /^https:\/\//i.test(p.image) ? p.image : null;
    const [cree] = await tx
      .insert(produit)
      .values({
        entrepriseId,
        type: "BIEN",
        nom: p.nom,
        description: p.description?.trim() || null,
        prixVente: p.prixVente ?? 0,
        prixAchat,
        codeBarres: p.code,
        suiviStock,
        stockActuel: suiviStock ? p.stock! : 0,
        coutMoyen: suiviStock ? prixAchat : 0,
        imageSourceUrl: adresseImage,
        creeParId,
      })
      .onConflictDoNothing()
      .returning({ id: produit.id });
    if (!cree) {
      resultats.push({ code: p.code, statut: "existant" }); // créé entre-temps par quelqu'un d'autre : même résultat, rien n'est écrasé
      continue;
    }
    if (adresseImage) imagesAChargerNb++;
    // Le stock de départ ouvre l'historique du produit, comme à la création ou à l'import.
    if (suiviStock && p.stock! > 0) {
      principal ??= await assurerDepotPrincipal(tx, entrepriseId);
      await deplacerStockDepot(tx, entrepriseId, cree.id, principal.id, p.stock!);
      await tx.insert(mouvementStock).values({ entrepriseId, produitId: cree.id, type: "INITIAL", quantite: p.stock!, stockApres: p.stock!, depotId: principal.id, creeParId });
    }
    resultats.push({ code: p.code, statut: "cree", suiviStock });
  }
  return { resultats, imagesAChargerNb };
}

/* ------------------------------------------------------------------ écran de l'Administrateur ------------------------------------------------------------------ */

export type ResumeBoutique = {
  produitsSuivis: number;
  produitsSuivisAvecCode: number;
  /** Codes reçus du site (30 derniers jours) qu'aucun produit ne porte : à renseigner dans le champ « Code-barres » du bon produit. */
  codesInconnus: { code: string; fois: number; derniereLe: string; source: string }[];
  /** Codes reçus dont le produit n'a pas le suivi de stock activé : la commande est enregistrée mais n'a rien sorti. */
  codesNonSuivis: { code: string; nom: string; fois: number }[];
  dernieresCommandes: { id: string; source: string; reference: string; creeLe: string; statut: string; nbLignes: number; nbProblemes: number }[];
  parConnexion: Record<string, { commandes: number; derniereLe: string | null }>;
};

/** Ce qu'il faut à l'Administrateur pour relier ses produits et suivre l'activité de la boutique. Tout est lu sous la RLS de son entreprise. */
export async function resumeBoutique(tx: TransactionDrizzle, entrepriseId: string): Promise<ResumeBoutique> {
  const [comptes] = await tx
    .select({
      suivis: sql<number>`count(*)::int`,
      avecCode: sql<number>`count(*) filter (where nullif(trim(${produit.codeBarres}), '') is not null)::int`,
    })
    .from(produit)
    .where(and(eq(produit.entrepriseId, entrepriseId), eq(produit.suiviStock, true)));

  const depuis = new Date(Date.now() - 30 * 24 * 3600 * 1000);
  const commandes = await tx
    .select()
    .from(commandeSite)
    .where(and(eq(commandeSite.entrepriseId, entrepriseId), gte(commandeSite.creeLe, depuis)))
    .orderBy(desc(commandeSite.creeLe))
    .limit(300);

  const inconnus = new Map<string, { code: string; fois: number; derniereLe: Date; source: string }>();
  const nonSuivis = new Map<string, { code: string; nom: string; fois: number }>();
  const parConnexion: ResumeBoutique["parConnexion"] = {};
  for (const c of commandes) {
    const source = c.cleId ?? c.connexionId;
    if (source) {
      const e = parConnexion[source] ?? { commandes: 0, derniereLe: null };
      e.commandes += 1;
      e.derniereLe ??= c.creeLe.toISOString(); // triées de la plus récente à la plus ancienne
      parConnexion[source] = e;
    }
    if (c.statut === "ANNULEE") continue;
    for (const l of c.lignes) {
      const k = enMinuscules(l.code);
      if (l.statut === "inconnu") {
        const e = inconnus.get(k) ?? { code: l.code, fois: 0, derniereLe: c.creeLe, source: c.source };
        e.fois += 1;
        inconnus.set(k, e);
      } else if (l.statut === "non_suivi") {
        const e = nonSuivis.get(k) ?? { code: l.code, nom: l.nom ?? l.code, fois: 0 };
        e.fois += 1;
        nonSuivis.set(k, e);
      }
    }
  }

  // Un code « inconnu » devenu connu depuis (l'Administrateur a renseigné le produit) ne s'affiche plus.
  const aVerifier = [...inconnus.keys()];
  if (aVerifier.length > 0) {
    const maintenantConnus = await tx.select({ code: produit.codeBarres }).from(produit).where(and(eq(produit.entrepriseId, entrepriseId), isNotNull(produit.codeBarres), inArray(sql`lower(${produit.codeBarres})`, aVerifier)));
    for (const p of maintenantConnus) inconnus.delete(enMinuscules(p.code!));
  }

  return {
    produitsSuivis: comptes?.suivis ?? 0,
    produitsSuivisAvecCode: comptes?.avecCode ?? 0,
    codesInconnus: [...inconnus.values()].sort((a, b) => b.fois - a.fois).slice(0, 50).map((e) => ({ code: e.code, fois: e.fois, derniereLe: e.derniereLe.toISOString(), source: e.source })),
    codesNonSuivis: [...nonSuivis.values()].sort((a, b) => b.fois - a.fois).slice(0, 50),
    dernieresCommandes: commandes.slice(0, 10).map((c) => ({
      id: c.id,
      source: c.source,
      reference: c.reference,
      creeLe: c.creeLe.toISOString(),
      statut: c.statut,
      nbLignes: c.lignes.length,
      nbProblemes: c.lignes.filter((l) => l.statut !== "ok").length,
    })),
    parConnexion,
  };
}
