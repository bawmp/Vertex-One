import webpush from "web-push";
import { and, eq, inArray, ne } from "drizzle-orm";
import { avecEntreprise, type TransactionDrizzle } from "@/db/client";
import { abonnementPush, canal, canalSourdine, membreCanal, mentionMessage, messageCanal, preferenceNotification, utilisateur } from "@/db/schema";
import { canalAccessible, estCanalPrive } from "@/lib/messagerie/acces";
import type { Module } from "@/lib/permissions";
import type { UtilisateurConnecte } from "@/lib/session";

/**
 * Notifications push de One Chat : un message envoyé prévient aussitôt, sur chacun de leurs appareils abonnés, les personnes
 * concernées — même application fermée. Le résultat est un « meilleur effort » : un échec de livraison ne fait jamais échouer
 * l'envoi du message (voir envoyerMessage), il est seulement journalisé.
 *
 * Qui est prévenu, selon le niveau choisi par chaque personne (src/lib/actions/notifications-chat.ts) :
 *  - TOUT : tous les messages des canaux qu'elle peut voir ;
 *  - PRIVE_MENTIONS (défaut) : messages directs, groupes privés et @mentions ;
 *  - DIRECTS_MENTIONS : messages directs et @mentions ;
 *  - AUCUNE : rien.
 * Un canal mis en sourdine ne notifie que pour une @mention. L'auteur n'est jamais prévenu de son propre message, et seules les
 * personnes qui peuvent VRAIMENT voir le canal (canalAccessible : droit, forfait, portée du projet, appartenance à un groupe
 * privé) reçoivent quoi que ce soit — jamais un aperçu de texte vers quelqu'un qui n'a pas accès à la conversation.
 */

export const NIVEAUX_NOTIFICATION = ["TOUT", "PRIVE_MENTIONS", "DIRECTS_MENTIONS", "AUCUNE"] as const;
export type NiveauNotification = (typeof NIVEAUX_NOTIFICATION)[number];

export type ReglagesNotification = { niveau: NiveauNotification; son: boolean; apercu: boolean };
export const REGLAGES_PAR_DEFAUT: ReglagesNotification = { niveau: "PRIVE_MENTIONS", son: true, apercu: true };

export function niveauValide(valeur: unknown): valeur is NiveauNotification {
  return typeof valeur === "string" && (NIVEAUX_NOTIFICATION as readonly string[]).includes(valeur);
}

/** Règle pure : cette personne doit-elle être prévenue de ce message ? (testée à part, sans base de données) */
export function doitNotifier(params: { niveau: NiveauNotification; typeCanal: string; mentionne: boolean; sourdine: boolean }): boolean {
  const { niveau, typeCanal, mentionne, sourdine } = params;
  if (niveau === "AUCUNE") return false;
  if (mentionne) return true; // une mention passe même par une sourdine
  if (sourdine) return false;
  if (niveau === "TOUT") return true;
  if (niveau === "PRIVE_MENTIONS") return typeCanal === "DIRECT" || typeCanal === "PRIVE";
  return typeCanal === "DIRECT"; // DIRECTS_MENTIONS
}

export function pushConfigure(): boolean {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

/** Clé publique donnée au navigateur pour s'abonner (elle n'est pas secrète) ; null tant que le push n'est pas configuré. */
export function cleVapidPublique(): string | null {
  return pushConfigure() ? (process.env.VAPID_PUBLIC_KEY ?? null) : null;
}

let vapidInitialise = false;
function initialiserVapid(): void {
  if (vapidInitialise) return;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:contact@vertexone.cm", process.env.VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
  vapidInitialise = true;
}

export type ChargePush = {
  titre: string;
  corps: string;
  /** Adresse relative ouverte au clic (le canal et le message). */
  url: string;
  /** Regroupe les notifications d'une même conversation : la plus récente remplace la précédente. */
  tag: string;
  son: boolean;
  canalId: string;
  messageId: string;
};

type MessagePourPush = {
  entrepriseId: string;
  canalId: string;
  messageId: string;
  auteurId: string;
  contenu: string;
  pieceNom: string | null;
};

function extrait(texte: string, max = 140): string {
  const propre = texte.replace(/\s+/g, " ").trim();
  return propre.length > max ? `${propre.slice(0, max - 1)}…` : propre;
}

type Envoi = { abonnementId: string; endpoint: string; cleP256dh: string; cleAuth: string; charge: ChargePush };

/** Prépare les envois : qui, sur quels appareils, avec quel texte. Aucune requête réseau ici, uniquement la base (RLS active). */
export async function preparerEnvois(tx: TransactionDrizzle, m: MessagePourPush): Promise<Envoi[]> {
  const [leCanal] = await tx.select().from(canal).where(and(eq(canal.id, m.canalId), eq(canal.entrepriseId, m.entrepriseId)));
  if (!leCanal) return [];
  const [auteur] = await tx.select({ nom: utilisateur.nomComplet }).from(utilisateur).where(and(eq(utilisateur.id, m.auteurId), eq(utilisateur.entrepriseId, m.entrepriseId)));

  const mentions = await tx.select({ utilisateurId: mentionMessage.utilisateurId }).from(mentionMessage).where(and(eq(mentionMessage.messageId, m.messageId), eq(mentionMessage.entrepriseId, m.entrepriseId)));
  const mentionnes = new Set(mentions.map((x) => x.utilisateurId));
  // Auteur du message auquel celui-ci répond (citation) : prévenu comme pour une mention, avec un titre adapté.
  const [leMessage] = await tx.select({ citeId: messageCanal.citeMessageId }).from(messageCanal).where(and(eq(messageCanal.id, m.messageId), eq(messageCanal.entrepriseId, m.entrepriseId)));
  const [cite] = leMessage?.citeId ? await tx.select({ auteurId: messageCanal.auteurId }).from(messageCanal).where(and(eq(messageCanal.id, leMessage.citeId), eq(messageCanal.entrepriseId, m.entrepriseId))) : [];
  const auteurCite = cite?.auteurId ?? null;

  // Candidats : les membres d'un canal privé ; pour un canal ouvert, les personnes qui ont choisi « tout » plus les mentionnées.
  let idsCandidats: string[];
  if (estCanalPrive(leCanal.type)) {
    const membres = await tx.select({ id: membreCanal.utilisateurId }).from(membreCanal).where(and(eq(membreCanal.canalId, m.canalId), eq(membreCanal.entrepriseId, m.entrepriseId)));
    idsCandidats = membres.map((x) => x.id);
  } else {
    const toutes = await tx
      .select({ id: preferenceNotification.utilisateurId })
      .from(preferenceNotification)
      .where(and(eq(preferenceNotification.entrepriseId, m.entrepriseId), eq(preferenceNotification.niveau, "TOUT")));
    idsCandidats = [...new Set([...toutes.map((x) => x.id), ...mentionnes])];
  }
  idsCandidats = idsCandidats.filter((id) => id !== m.auteurId);
  if (idsCandidats.length === 0) return [];

  // `utilisateur` reste en RLS permissive (Better-Auth) : le filtre entrepriseId est donc explicite.
  const personnes = await tx
    .select({ id: utilisateur.id, role: utilisateur.role, modulesAutorises: utilisateur.modulesAutorises, langue: utilisateur.langue })
    .from(utilisateur)
    .where(and(eq(utilisateur.entrepriseId, m.entrepriseId), eq(utilisateur.statut, "ACTIF"), ne(utilisateur.role, "CLIENT"), inArray(utilisateur.id, idsCandidats)));
  if (personnes.length === 0) return [];
  const ids = personnes.map((p) => p.id);

  const [prefs, sourdines, abonnements] = await Promise.all([
    tx.select().from(preferenceNotification).where(and(eq(preferenceNotification.entrepriseId, m.entrepriseId), inArray(preferenceNotification.utilisateurId, ids))),
    tx.select({ utilisateurId: canalSourdine.utilisateurId }).from(canalSourdine).where(and(eq(canalSourdine.entrepriseId, m.entrepriseId), eq(canalSourdine.canalId, m.canalId), inArray(canalSourdine.utilisateurId, ids))),
    tx.select().from(abonnementPush).where(and(eq(abonnementPush.entrepriseId, m.entrepriseId), inArray(abonnementPush.utilisateurId, ids))),
  ]);
  const sourds = new Set(sourdines.map((s) => s.utilisateurId));

  const envois: Envoi[] = [];
  for (const p of personnes) {
    const reglages = prefs.find((x) => x.utilisateurId === p.id);
    const niveau = reglages && niveauValide(reglages.niveau) ? reglages.niveau : REGLAGES_PAR_DEFAUT.niveau;
    const mentionne = mentionnes.has(p.id);
    if (!doitNotifier({ niveau, typeCanal: leCanal.type, mentionne, sourdine: sourds.has(p.id) })) continue;
    const appareils = abonnements.filter((a) => a.utilisateurId === p.id);
    if (appareils.length === 0) continue;

    // Dernier garde-fou : la personne peut-elle réellement voir ce canal ? (droit, forfait, portée du projet, appartenance)
    const pseudo = { utilisateurId: p.id, entrepriseId: m.entrepriseId, role: p.role, modulesAutorises: p.modulesAutorises as Module[] | null } as UtilisateurConnecte;
    if (!(await canalAccessible(tx, pseudo, m.canalId))) continue;

    const en = p.langue === "en";
    const auteurNom = auteur?.nom ?? (en ? "A colleague" : "Un collègue");
    const ou = leCanal.type === "DIRECT" ? "" : leCanal.type === "PRIVE" ? ` · ${leCanal.nom}` : ` · #${leCanal.nom}`;
    const repond = auteurCite === p.id;
    const titre = mentionne
      ? repond
        ? en ? `${auteurNom} replied to your message${ou}` : `${auteurNom} a répondu à votre message${ou}`
        : en ? `${auteurNom} mentioned you${ou}` : `${auteurNom} vous a mentionné(e)${ou}`
      : `${auteurNom}${ou}`;
    const apercuTexte = m.contenu ? extrait(m.contenu) : m.pieceNom ? (en ? `Attachment: ${m.pieceNom}` : `Pièce jointe : ${m.pieceNom}`) : "";
    const corps = reglages?.apercu === false || !apercuTexte ? (en ? "New message" : "Nouveau message") : apercuTexte;
    const charge: ChargePush = {
      titre,
      corps,
      url: `/app/messagerie?canal=${m.canalId}&message=${m.messageId}`,
      tag: `one-chat-${m.canalId}`,
      son: reglages ? reglages.son : REGLAGES_PAR_DEFAUT.son,
      canalId: m.canalId,
      messageId: m.messageId,
    };
    for (const a of appareils) envois.push({ abonnementId: a.id, endpoint: a.endpoint, cleP256dh: a.cleP256dh, cleAuth: a.cleAuth, charge });
  }
  return envois;
}

/** Envoie une charge à un appareil ; renvoie « expire » quand le service de push dit que l'adresse n'existe plus (404/410). */
async function envoyerUn(envoi: Envoi): Promise<"ok" | "expire" | "erreur"> {
  try {
    await webpush.sendNotification({ endpoint: envoi.endpoint, keys: { p256dh: envoi.cleP256dh, auth: envoi.cleAuth } }, JSON.stringify(envoi.charge), { TTL: 60 * 60 * 6, urgency: "high" });
    return "ok";
  } catch (erreur) {
    const code = (erreur as { statusCode?: number }).statusCode;
    if (code === 404 || code === 410) return "expire";
    console.error(`[push] échec d'envoi (${code ?? "réseau"}) :`, erreur instanceof Error ? erreur.message : erreur);
    return "erreur";
  }
}

/**
 * Prévient les personnes concernées par un message qui vient d'être enregistré. À appeler APRÈS la réponse (after()) :
 * jamais d'attente côté auteur, jamais d'erreur remontée. Sans clés VAPID, ne fait rien.
 */
export async function notifierNouveauMessage(message: MessagePourPush): Promise<{ envoyes: number; expires: number }> {
  if (!pushConfigure()) return { envoyes: 0, expires: 0 };
  try {
    initialiserVapid();
    const envois = await avecEntreprise(message.entrepriseId, (tx) => preparerEnvois(tx, message));
    if (envois.length === 0) return { envoyes: 0, expires: 0 };
    const resultats = await Promise.all(envois.map((e) => envoyerUn(e)));
    const expires = envois.filter((_, i) => resultats[i] === "expire").map((e) => e.abonnementId);
    if (expires.length > 0) {
      await avecEntreprise(message.entrepriseId, (tx) => tx.delete(abonnementPush).where(and(eq(abonnementPush.entrepriseId, message.entrepriseId), inArray(abonnementPush.id, expires))));
    }
    return { envoyes: resultats.filter((r) => r === "ok").length, expires: expires.length };
  } catch (erreur) {
    console.error("[push] notification impossible :", erreur instanceof Error ? erreur.message : erreur);
    return { envoyes: 0, expires: 0 };
  }
}

/** Notification d'essai vers tous les appareils de la personne (bouton « Envoyer un essai »). */
export async function envoyerEssai(entrepriseId: string, utilisateurId: string): Promise<{ envoyes: number; appareils: number }> {
  if (!pushConfigure()) return { envoyes: 0, appareils: 0 };
  initialiserVapid();
  const abonnements = await avecEntreprise(entrepriseId, (tx) => tx.select().from(abonnementPush).where(and(eq(abonnementPush.entrepriseId, entrepriseId), eq(abonnementPush.utilisateurId, utilisateurId))));
  const charge: ChargePush = { titre: "Vertex One", corps: "Les notifications fonctionnent sur cet appareil ✓", url: "/app/messagerie", tag: "one-chat-essai", son: true, canalId: "", messageId: "" };
  const resultats = await Promise.all(abonnements.map((a) => envoyerUn({ abonnementId: a.id, endpoint: a.endpoint, cleP256dh: a.cleP256dh, cleAuth: a.cleAuth, charge })));
  const expires = abonnements.filter((_, i) => resultats[i] === "expire").map((a) => a.id);
  if (expires.length > 0) await avecEntreprise(entrepriseId, (tx) => tx.delete(abonnementPush).where(and(eq(abonnementPush.entrepriseId, entrepriseId), inArray(abonnementPush.id, expires))));
  return { envoyes: resultats.filter((r) => r === "ok").length, appareils: abonnements.length };
}
