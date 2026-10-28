"use client";

import { enregistrerAbonnementPush, supprimerAbonnementPush } from "@/lib/actions/notifications-chat";

/**
 * Côté navigateur des notifications push de One Chat : service worker, abonnement de CET appareil, son d'arrivée.
 * Mémorise dans localStorage si cet appareil est abonné (« onechat_push »), pour que le badge n'ajoute pas sa propre
 * notification locale par-dessus celle du service worker.
 */

export const EVENEMENT_NOUVEAU_MESSAGE = "one-chat:nouveau-message";
const CLE_LOCALE = "onechat_push";

export function pushPris(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

function cleVersOctets(cle: string): Uint8Array<ArrayBuffer> {
  const remplissage = "=".repeat((4 - (cle.length % 4)) % 4);
  const base64 = (cle + remplissage).replace(/-/g, "+").replace(/_/g, "/");
  const brut = atob(base64);
  const octets = new Uint8Array(new ArrayBuffer(brut.length));
  for (let i = 0; i < brut.length; i += 1) octets[i] = brut.charCodeAt(i);
  return octets;
}

function memoriser(actif: boolean) {
  try {
    if (actif) localStorage.setItem(CLE_LOCALE, "1");
    else localStorage.removeItem(CLE_LOCALE);
  } catch {
    // navigation privée : sans importance.
  }
}

export function appareilAbonneLocalement(): boolean {
  try {
    return localStorage.getItem(CLE_LOCALE) === "1";
  } catch {
    return false;
  }
}

function nomAppareil(): string {
  const ua = navigator.userAgent;
  const navigateur = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Navigateur";
  const systeme = /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Windows/.test(ua) ? "Windows" : /Mac OS/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "";
  return systeme ? `${navigateur} · ${systeme}` : navigateur;
}

/** Enregistre le service worker (idempotent) et renvoie son enregistrement prêt. */
async function enregistrementPret(): Promise<ServiceWorkerRegistration> {
  await navigator.serviceWorker.register("/sw.js");
  return navigator.serviceWorker.ready;
}

/**
 * Abonne cet appareil (la permission du navigateur doit déjà être accordée) et l'enregistre côté serveur. Renvoie une
 * erreur lisible sinon. Si la clé publique a changé depuis un ancien abonnement, celui-ci est remplacé.
 */
export async function abonnerCetAppareil(clePublique: string): Promise<{ ok: true } | { erreur: string }> {
  if (!pushPris()) return { erreur: "Ce navigateur ne gère pas les notifications push." };
  try {
    const enregistrement = await enregistrementPret();
    let abonnement = await enregistrement.pushManager.getSubscription();
    if (abonnement) {
      const actuelle = abonnement.options?.applicationServerKey ? new Uint8Array(abonnement.options.applicationServerKey) : null;
      const voulue = cleVersOctets(clePublique);
      const identique = actuelle !== null && actuelle.length === voulue.length && actuelle.every((v, i) => v === voulue[i]);
      if (!identique) {
        await abonnement.unsubscribe();
        abonnement = null;
      }
    }
    if (!abonnement) abonnement = await enregistrement.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: cleVersOctets(clePublique) });
    const json = abonnement.toJSON();
    const reponse = await enregistrerAbonnementPush({ endpoint: json.endpoint, keys: json.keys }, nomAppareil());
    if (reponse.erreur) return { erreur: reponse.erreur };
    memoriser(true);
    return { ok: true };
  } catch (e) {
    return { erreur: e instanceof Error ? e.message : "Abonnement impossible." };
  }
}

/** Désabonne cet appareil (côté navigateur puis côté serveur). Appelée aussi à la déconnexion. */
export async function desabonnerCetAppareil(): Promise<void> {
  memoriser(false);
  if (!pushPris()) return;
  try {
    const enregistrement = await navigator.serviceWorker.getRegistration("/");
    const abonnement = enregistrement ? await enregistrement.pushManager.getSubscription() : null;
    if (!abonnement) return;
    await supprimerAbonnementPush(abonnement.endpoint).catch(() => undefined);
    await abonnement.unsubscribe();
  } catch {
    // meilleur effort : la déconnexion ne doit jamais échouer à cause de ça.
  }
}

/** Petit « ding » de deux notes, sans fichier audio (WebAudio). Silencieux si le navigateur l'interdit (aucun geste préalable). */
export function jouerSonMessage(): void {
  try {
    const Contexte = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Contexte) return;
    const ctx = new Contexte();
    const maintenant = ctx.currentTime;
    [[880, 0], [1174.66, 0.12]].forEach(([frequence, decalage]) => {
      const oscillateur = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillateur.type = "sine";
      oscillateur.frequency.value = frequence;
      gain.gain.setValueAtTime(0.0001, maintenant + decalage);
      gain.gain.exponentialRampToValueAtTime(0.18, maintenant + decalage + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, maintenant + decalage + 0.28);
      oscillateur.connect(gain).connect(ctx.destination);
      oscillateur.start(maintenant + decalage);
      oscillateur.stop(maintenant + decalage + 0.3);
    });
    setTimeout(() => ctx.close().catch(() => undefined), 700);
  } catch {
    // sans importance.
  }
}
