// Palier 3, section 2-3 — chat-as-a-service (ex. Stream Chat) plutôt que
// réinventer un moteur temps réel : les messages ne sont jamais stockés
// dans notre base, seule la correspondance Projet ↔ canal externe l'est
// (voir src/db/schema.ts, table `canal`).
//
// Point non négociable (section 3) : le prestataire ne connaît pas nos
// entreprises clientes, seulement des utilisateurs et des canaux — toute
// isolation multi-tenant lui est donc invisible. La parade est un
// préfixage systématique par entrepriseId, ci-dessous, jamais contournable
// même par erreur de code (une chaîne concaténée, pas une option).

export function idExterneUtilisateur(entrepriseId: string, utilisateurId: string): string {
  return `${entrepriseId}__${utilisateurId}`;
}

export function idExterneCanal(entrepriseId: string, ancre: string): string {
  return `${entrepriseId}__${ancre}`;
}

const CHAT_API_KEY = process.env.STREAM_CHAT_API_KEY;

/**
 * Même traitement que Migadu/NotchPay/Resend avant configuration (voir
 * CLAUDE.md) : le code réel (préfixage, appels prévus) est en place, mais
 * n'appelle aucune API tant que STREAM_CHAT_API_KEY n'est pas configurée —
 * avertissement clair plutôt qu'échec silencieux.
 */
function chatConfigure(): boolean {
  if (!CHAT_API_KEY) {
    console.warn("[chat] STREAM_CHAT_API_KEY non configurée — appel prestataire de chat ignoré.");
    return false;
  }
  return true;
}

export async function creerUtilisateurChat(entrepriseId: string, utilisateurId: string, nomComplet: string): Promise<void> {
  if (!chatConfigure()) return;
  // TODO Palier 3 : appel réel au SDK serveur du prestataire (ex. StreamChat.upsertUser).
  void idExterneUtilisateur(entrepriseId, utilisateurId);
  void nomComplet;
}

export async function retirerUtilisateurChat(entrepriseId: string, utilisateurId: string): Promise<void> {
  if (!chatConfigure()) return;
  // TODO Palier 3 : retirer l'utilisateur de tous les canaux de son entreprise chez le prestataire.
  void idExterneUtilisateur(entrepriseId, utilisateurId);
}

export async function creerCanalChat(params: {
  entrepriseId: string;
  ancre: string;
  nom: string;
  idsMembres: string[];
}): Promise<{ idFournisseurChat: string; cree: boolean }> {
  const idFournisseurChat = idExterneCanal(params.entrepriseId, params.ancre);
  if (!chatConfigure()) return { idFournisseurChat, cree: false };
  // TODO Palier 3 : appel réel (ex. StreamChat.channel(...).create()) avec
  // params.idsMembres déjà préfixés par idExterneUtilisateur().
  return { idFournisseurChat, cree: true };
}

export async function ajouterMembreCanal(idFournisseurChat: string, entrepriseId: string, utilisateurId: string): Promise<void> {
  if (!chatConfigure()) return;
  // TODO Palier 3 : appel réel au SDK (channel.addMembers([...])).
  void idFournisseurChat;
  void idExterneUtilisateur(entrepriseId, utilisateurId);
}
