import { m } from "@/lib/i18n/catalogue";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * Garde contre les appels vers un réseau interne (SSRF), 2026-11-12. Vertex One appelle l'adresse du site saisie par un utilisateur :
 * sans garde, quelqu'un pourrait viser un service interne (base, métadonnées du cloud, réseau privé). Règles :
 *  - HTTPS seulement, port 443 seulement, aucun identifiant dans l'adresse (user:motdepasse@) ;
 *  - l'adresse est ramenée à son origine (+ un éventuel dossier, pour un WordPress installé dans /boutique) ;
 *  - le nom est résolu et CHAQUE adresse IP obtenue doit être publique (ni boucle locale, ni réseau privé, ni lien local, ni
 *    métadonnées cloud 169.254.x.x, ni CGNAT) ; une adresse IP écrite directement est refusée ;
 *  - les redirections ne sont JAMAIS suivies (une redirection vers une adresse interne contournerait la vérification).
 * Limite assumée : entre la vérification et la connexion le DNS pourrait changer (« DNS rebinding ») ; les réponses sont de plus bornées
 * en taille et en durée, et seules des lectures de catalogue/commandes et des mises à jour de stock sont émises.
 */

export type AdresseSite = { origine: string; base: string };

function octets(ip: string): number[] | null {
  const p = ip.split(".").map(Number);
  return p.length === 4 && p.every((n) => Number.isInteger(n) && n >= 0 && n <= 255) ? p : null;
}

/** Vrai si l'adresse IP n'est pas joignable publiquement (v4 ou v6). */
export function estAdressePrivee(ip: string): boolean {
  const v4 = octets(ip.startsWith("::ffff:") ? ip.slice(7) : ip);
  if (v4) {
    const [a, b] = v4;
    return (
      a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
      (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)) || a >= 224
    );
  }
  const v6 = ip.toLowerCase();
  return v6 === "::" || v6 === "::1" || v6.startsWith("fc") || v6.startsWith("fd") || v6.startsWith("fe8") || v6.startsWith("fe9") || v6.startsWith("fea") || v6.startsWith("feb") || v6.startsWith("ff") || v6.startsWith("64:ff9b");
}

/** Normalise ce que l'utilisateur a collé (« maboutique.com », « https://maboutique.com/ ») ; renvoie un message simple en cas de problème. */
export function normaliserAdresse(saisie: string): { ok: true; adresse: AdresseSite } | { ok: false; erreur: string } {
  let texte = saisie.trim();
  if (!texte) return { ok: false, erreur: m("Collez l'adresse de votre site (ex. https://maboutique.com).") };
  if (!/^https?:\/\//i.test(texte)) texte = `https://${texte}`;
  let url: URL;
  try {
    url = new URL(texte);
  } catch {
    return { ok: false, erreur: m("Cette adresse n'est pas valide. Exemple : https://maboutique.com") };
  }
  if (url.protocol !== "https:") return { ok: false, erreur: m("L'adresse doit commencer par https:// (un site sécurisé). Contactez votre hébergeur si votre site n'a pas de certificat.") };
  if (url.username || url.password) return { ok: false, erreur: m("L'adresse ne doit pas contenir de nom d'utilisateur ni de mot de passe.") };
  if (url.port && url.port !== "443") return { ok: false, erreur: m("Seul le port standard (443) est accepté.") };
  if (isIP(url.hostname.replace(/^\[|\]$/g, "")) || !url.hostname.includes(".")) return { ok: false, erreur: m("Utilisez le nom de domaine de votre site (pas une adresse numérique).") };
  const dossier = url.pathname.replace(/\/+$/, "");
  return { ok: true, adresse: { origine: url.origin, base: `${url.origin}${dossier}` } };
}

type Resolveur = (hote: string) => Promise<string[]>;
const resolveurReel: Resolveur = async (hote) => (await lookup(hote, { all: true })).map((r) => r.address);

/** Vérifie que le nom pointe uniquement vers des adresses publiques. `resolveur` est remplaçable pour les tests. */
export async function verifierHotePublic(adresse: AdresseSite, resolveur: Resolveur = resolveurReel): Promise<{ ok: true } | { ok: false; erreur: string }> {
  const hote = new URL(adresse.origine).hostname;
  let ips: string[];
  try {
    ips = await resolveur(hote);
  } catch {
    return { ok: false, erreur: m("Impossible de trouver ce site : vérifiez l'adresse.") };
  }
  if (ips.length === 0 || ips.some(estAdressePrivee)) return { ok: false, erreur: m("Cette adresse n'est pas autorisée.") };
  return { ok: true };
}

export type ReponseSite = { statut: number; corps: string; entetes: Headers };
export type Appeleur = (url: string, init?: { methode?: string; entetes?: Record<string, string>; corps?: string }) => Promise<ReponseSite>;

const DELAI_MS = 20_000;
const TAILLE_MAX = 5 * 1024 * 1024;

/**
 * Appeleur réel : garde SSRF, délai, taille bornée, aucune redirection. Lance une `ErreurSite` au message simple, jamais une exception
 * technique à montrer à l'utilisateur.
 */
export class ErreurSite extends Error {}

export function creerAppeleur(adresse: AdresseSite, options: { resolveur?: Resolveur; fetchImpl?: typeof fetch } = {}): Appeleur {
  const fetchImpl = options.fetchImpl ?? fetch;
  return async (url, init) => {
    // Origine EXACTE (schéma + nom + port) : un simple « commence par » laisserait passer « maboutique.com.pirate.net » et leur enverrait les clés.
    let origineDemandee: string;
    try {
      origineDemandee = new URL(url).origin;
    } catch {
      throw new ErreurSite(m("Adresse hors du site connecté."));
    }
    if (origineDemandee !== adresse.origine) throw new ErreurSite(m("Adresse hors du site connecté."));
    const sur = await verifierHotePublic(adresse, options.resolveur);
    if (!sur.ok) throw new ErreurSite(sur.erreur);
    const controle = new AbortController();
    const minuteur = setTimeout(() => controle.abort(), DELAI_MS);
    try {
      const r = await fetchImpl(url, { method: init?.methode ?? "GET", headers: init?.entetes, body: init?.corps, redirect: "manual", signal: controle.signal });
      if (r.status >= 300 && r.status < 400) throw new ErreurSite(m("Votre site redirige vers une autre adresse : utilisez l'adresse exacte de votre site (avec ou sans www)."));
      const lu = await r.arrayBuffer();
      if (lu.byteLength > TAILLE_MAX) throw new ErreurSite(m("Réponse trop volumineuse."));
      return { statut: r.status, corps: new TextDecoder().decode(lu), entetes: r.headers };
    } catch (e) {
      if (e instanceof ErreurSite) throw e;
      throw new ErreurSite(m("Votre site ne répond pas. Vérifiez qu'il est en ligne, puis réessayez."));
    } finally {
      clearTimeout(minuteur);
    }
  };
}
