import { lookup } from "node:dns/promises";
import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { avecEntreprise, type TransactionDrizzle } from "@/db/client";
import { produit } from "@/db/schema";
import { estAdressePrivee } from "@/lib/boutique/adresse-sure";
import { effacerObjetStockage, televerserDocument } from "@/lib/documents/stockage";
import { detecterFormat } from "@/lib/one-form/fichiers";
import { m } from "@/lib/i18n/catalogue";

/**
 * Images de produits chargées depuis une adresse web (import de produits, 2026-11-13). L'import n'écrit que l'ADRESSE (`produit.image_source_url`) :
 * le téléchargement se fait ensuite, hors transaction, par `chargerImagesEnAttente` (juste après l'import, puis à la demande depuis la page Produits).
 *
 * Mêmes protections que la connexion d'une boutique : HTTPS seulement (port 443, sans identifiants), le nom est résolu et CHAQUE adresse IP doit
 * être publique (jamais un réseau interne), AUCUNE redirection suivie, durée et taille bornées, et le contenu est reconnu sur ses OCTETS (jamais sur
 * l'extension ni le type annoncé par le serveur) : seules des images JPEG, PNG ou WebP sont stockées.
 */

export class ErreurImage extends Error {
  /** Définitive : retenter ne servirait à rien (adresse refusée, fichier qui n'est pas une image…). Sinon l'adresse est gardée pour un nouvel essai. */
  constructor(message: string, readonly definitive: boolean) {
    super(message);
  }
}

const TAILLE_MAX = 5 * 1024 * 1024;
const DELAI_MS = 20_000;

type Resolveur = (hote: string) => Promise<string[]>;
const resolveurReel: Resolveur = async (hote) => (await lookup(hote, { all: true })).map((r) => r.address);

export type ImageTelechargee = { octets: Buffer; mime: string; extension: string };

export async function telechargerImage(adresse: string, options: { resolveur?: Resolveur; fetchImpl?: typeof fetch } = {}): Promise<ImageTelechargee> {
  let url: URL;
  try {
    url = new URL(adresse.trim());
  } catch {
    throw new ErreurImage(m("Adresse d'image refusée : elle doit commencer par https://."), true);
  }
  const hote = url.hostname.replace(/^\[|\]$/g, "");
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443") || !hote.includes(".") || /^[\d.:a-f]+$/i.test(hote)) {
    throw new ErreurImage(m("Adresse d'image refusée : elle doit commencer par https://."), true);
  }

  let ips: string[];
  try {
    ips = await (options.resolveur ?? resolveurReel)(hote);
  } catch {
    throw new ErreurImage(m("Le site de l'image ne répond pas."), false); // une panne de nom passagère : on retentera
  }
  if (ips.length === 0 || ips.some(estAdressePrivee)) throw new ErreurImage(m("Cette adresse d'image n'est pas autorisée."), true);

  const controle = new AbortController();
  const minuteur = setTimeout(() => controle.abort(), DELAI_MS);
  try {
    const r = await (options.fetchImpl ?? fetch)(url.toString(), { redirect: "manual", signal: controle.signal, headers: { Accept: "image/jpeg,image/png,image/webp" } });
    if (r.status >= 300 && r.status < 400) throw new ErreurImage(m("L'image redirige vers une autre adresse : utilisez son adresse directe."), true);
    if (r.status === 429 || r.status >= 500) throw new ErreurImage(m("Le site de l'image ne répond pas."), false);
    if (r.status !== 200) throw new ErreurImage(m("L'image est introuvable (adresse inaccessible ou supprimée)."), true);
    const annonce = Number(r.headers.get("content-length") ?? 0);
    if (annonce > TAILLE_MAX) throw new ErreurImage(m("L'image est trop lourde (5 Mo au plus)."), true);

    // Lecture bornée : on s'arrête dès que la limite est dépassée, même si le serveur n'a pas annoncé de taille.
    const morceaux: Uint8Array[] = [];
    let total = 0;
    const lecteur = r.body?.getReader();
    if (!lecteur) throw new ErreurImage(m("L'image est introuvable (adresse inaccessible ou supprimée)."), true);
    for (;;) {
      const { done, value } = await lecteur.read();
      if (done) break;
      total += value.byteLength;
      if (total > TAILLE_MAX) {
        await lecteur.cancel().catch(() => {});
        throw new ErreurImage(m("L'image est trop lourde (5 Mo au plus)."), true);
      }
      morceaux.push(value);
    }
    const octets = Buffer.concat(morceaux);
    const format = detecterFormat(octets);
    if (!format || format.categorie !== "IMAGE") throw new ErreurImage(m("Ce fichier n'est pas une image JPEG, PNG ou WebP."), true);
    return { octets, mime: format.mime, extension: format.extension };
  } catch (e) {
    if (e instanceof ErreurImage) throw e;
    throw new ErreurImage(m("Le site de l'image ne répond pas."), false); // réseau coupé ou délai dépassé
  } finally {
    clearTimeout(minuteur);
  }
}

export type ResultatChargementImages = { chargees: number; refusees: number; enAttente: number; stockageIndisponible: boolean };

/**
 * Télécharge au plus `limite` images en attente de l'entreprise (en parallèle par 3, dans la limite de `budgetMs`) et les range dans R2 comme
 * toute image de produit. Une image déjà posée à la main entre-temps n'est JAMAIS écrasée (l'objet téléchargé est alors effacé). Un refus
 * définitif garde son motif (`image_source_erreur`) ; une panne passagère garde l'adresse pour un nouvel essai. Aucun appel réseau dans une
 * transaction. Ne lance jamais d'exception.
 */
export async function chargerImagesEnAttente(
  entrepriseId: string,
  options: { limite?: number; budgetMs?: number; telecharger?: typeof telechargerImage; televerser?: typeof televerserDocument } = {}
): Promise<ResultatChargementImages> {
  const telecharger = options.telecharger ?? telechargerImage;
  const televerser = options.televerser ?? televerserDocument;
  const fin = Date.now() + (options.budgetMs ?? 40_000);
  const resultat: ResultatChargementImages = { chargees: 0, refusees: 0, enAttente: 0, stockageIndisponible: false };

  const aTraiter = await avecEntreprise(entrepriseId, (tx) =>
    tx
      .select({ id: produit.id, adresse: produit.imageSourceUrl, aDejaUneImage: produit.imageCleStockage })
      .from(produit)
      .where(and(eq(produit.entrepriseId, entrepriseId), isNotNull(produit.imageSourceUrl)))
      .limit(options.limite ?? 15)
  );

  async function traiter(p: { id: string; adresse: string | null; aDejaUneImage: string | null }) {
    if (!p.adresse) return;
    if (p.aDejaUneImage) {
      // Une image existe déjà (posée à la main) : l'adresse n'a plus d'objet.
      await avecEntreprise(entrepriseId, (tx) => tx.update(produit).set({ imageSourceUrl: null, imageSourceErreur: null }).where(and(eq(produit.id, p.id), eq(produit.entrepriseId, entrepriseId))));
      return;
    }
    try {
      const image = await telecharger(p.adresse);
      const dest = await televerser({ entrepriseId, nomFichier: `produit-${p.id}.${image.extension}`, typeMime: image.mime, contenu: image.octets, dossier: "produits" });
      if (!dest.televerse) {
        resultat.stockageIndisponible = true; // R2 non configuré ou en panne : on garde l'adresse, rien n'est perdu
        return;
      }
      const posee = await avecEntreprise(entrepriseId, (tx) =>
        tx
          .update(produit)
          .set({ imageCleStockage: dest.cleStockage, imageTypeMime: image.mime, imageSourceUrl: null, imageSourceErreur: null })
          .where(and(eq(produit.id, p.id), eq(produit.entrepriseId, entrepriseId), isNull(produit.imageCleStockage)))
          .returning({ id: produit.id })
      );
      if (posee.length === 0) await effacerObjetStockage(dest.cleStockage); // quelqu'un a posé une image entre-temps : on n'écrase rien
      else resultat.chargees++;
    } catch (e) {
      if (e instanceof ErreurImage && e.definitive) {
        resultat.refusees++;
        await avecEntreprise(entrepriseId, (tx) => tx.update(produit).set({ imageSourceUrl: null, imageSourceErreur: e.message }).where(and(eq(produit.id, p.id), eq(produit.entrepriseId, entrepriseId))));
      } else if (!(e instanceof ErreurImage)) {
        console.error("[images] chargement impossible :", e instanceof Error ? e.message : e);
      }
    }
  }

  // Trois à la fois, sans jamais démarrer un nouveau téléchargement une fois le budget de temps épuisé.
  const file = [...aTraiter];
  await Promise.all(
    Array.from({ length: 3 }, async () => {
      for (let p = file.shift(); p; p = file.shift()) {
        if (Date.now() > fin) return;
        await traiter(p);
      }
    })
  );

  resultat.enAttente = (await etatImages(entrepriseId)).enAttente;
  return resultat;
}

export type EtatImages = { enAttente: number; refusees: { id: string; nom: string; motif: string }[] };

/** Ce que la page Produits montre : images encore à charger, et les refus (avec leur motif) pour que l'utilisateur les corrige. */
export async function etatImages(entrepriseId: string, tx?: TransactionDrizzle): Promise<EtatImages> {
  const lire = async (t: TransactionDrizzle) => {
    const [attente] = await t.select({ n: sql<number>`count(*)::int` }).from(produit).where(and(eq(produit.entrepriseId, entrepriseId), isNotNull(produit.imageSourceUrl)));
    const refusees = await t
      .select({ id: produit.id, nom: produit.nom, motif: produit.imageSourceErreur })
      .from(produit)
      .where(and(eq(produit.entrepriseId, entrepriseId), isNotNull(produit.imageSourceErreur), isNull(produit.imageSourceUrl), isNull(produit.imageCleStockage)))
      .limit(50);
    return { enAttente: attente?.n ?? 0, refusees: refusees.map((r) => ({ id: r.id, nom: r.nom, motif: r.motif ?? "" })) };
  };
  return tx ? lire(tx) : avecEntreprise(entrepriseId, lire);
}
