"use server";

import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { generateRandomString } from "better-auth/crypto";
import { avecEntreprise } from "@/db/client";
import { canal, membreCanal, mentionMessage, messageCanal, reactionMessage, utilisateur } from "@/db/schema";
import { recupererUtilisateurConnecte, type UtilisateurConnecte } from "@/lib/session";
import { peut, type Module } from "@/lib/permissions";
import { idExterneCanal } from "@/lib/chat/client";
import { effacerObjetStockage, televerserDocument } from "@/lib/documents/stockage";
import { CATEGORIES_FICHIER, nomAffichable, nomFichierSain, validerFichier } from "@/lib/one-form/fichiers";
import { candidatsMentions, canalAccessible, marquerCanalLu, messagerieDisponible, reactionsDe, LONGUEUR_MAX_MESSAGE, type MessageAffiche, type ReactionAffichee } from "@/lib/messagerie/acces";
import { emojiValide, extraireMentions } from "@/lib/messagerie/mentions";
import { signalerMessagesANotifier } from "@/lib/messagerie/notifications";

/**
 * Envoie un message (texte et/ou une pièce jointe) dans un canal, ou une réponse dans le fil d'un message. L'auteur
 * est TOUJOURS l'utilisateur de la session (jamais une valeur du client) ; le canal doit faire partie de ceux qu'il a
 * le droit de voir, et il faut le droit CREER sur la messagerie. La pièce jointe (image, PDF, Word ou Excel, 4 Mo au
 * plus) est reconnue sur ses octets, jamais sur son nom ni son type déclaré. Les @mentions sont décidées ici, côté
 * serveur, et seules les personnes qui peuvent réellement voir le canal sont mentionnées.
 */
export async function envoyerMessage(formData: FormData): Promise<{ message?: MessageAffiche; erreur?: string }> {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte, "MESSAGERIE", "CREER")) return { erreur: "Vous n'avez pas le droit d'écrire dans la messagerie." };

  const canalId = String(formData.get("canalId") ?? "");
  const parentId = String(formData.get("parentId") ?? "") || null;
  const contenu = String(formData.get("contenu") ?? "").trim();
  const fichier = formData.get("fichier");
  const aUnFichier = fichier instanceof File && fichier.size > 0;

  if (!contenu && !aUnFichier) return { erreur: "Le message est vide." };
  if (contenu.length > LONGUEUR_MAX_MESSAGE) return { erreur: `Le message est trop long (${LONGUEUR_MAX_MESSAGE} caractères au maximum).` };

  // Validation du fichier AVANT tout accès à la base ou au stockage.
  let piece: { octets: Buffer; mime: string; extension: string; nom: string; taille: number } | null = null;
  if (aUnFichier) {
    const octets = Buffer.from(await (fichier as File).arrayBuffer());
    const verdict = validerFichier({ taille: octets.length, octets, categories: CATEGORIES_FICHIER });
    if (!verdict.ok) return { erreur: verdict.erreur };
    piece = { octets, mime: verdict.format.mime, extension: verdict.format.extension, nom: nomAffichable((fichier as File).name), taille: octets.length };
  }

  return avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const leCanal = await canalAccessible(tx, utilisateurConnecte, canalId);
    if (!leCanal) return { erreur: "Ce canal est introuvable." };

    // Réponse de fil : le message d'origine doit être dans CE canal, ne pas être lui-même une réponse (un seul niveau)
    // ni avoir été supprimé.
    if (parentId) {
      const [parent] = await tx
        .select({ canalId: messageCanal.canalId, parentId: messageCanal.parentId, supprimeLe: messageCanal.supprimeLe })
        .from(messageCanal)
        .where(and(eq(messageCanal.id, parentId), eq(messageCanal.entrepriseId, utilisateurConnecte.entrepriseId)));
      if (!parent || parent.canalId !== canalId || parent.parentId || parent.supprimeLe) return { erreur: "Ce message n'accepte pas de réponse." };
    }

    let cle: string | null = null;
    if (piece) {
      const televersement = await televerserDocument({
        entrepriseId: utilisateurConnecte.entrepriseId,
        nomFichier: nomFichierSain(piece.nom, piece.extension),
        typeMime: piece.mime,
        contenu: piece.octets,
        dossier: `messagerie/${canalId}`,
      });
      if (!televersement.televerse) return { erreur: "Le stockage des fichiers n'est pas disponible pour le moment." };
      cle = televersement.cleStockage;
    }

    const [cree] = await tx
      .insert(messageCanal)
      .values({
        entrepriseId: utilisateurConnecte.entrepriseId,
        canalId,
        auteurId: utilisateurConnecte.utilisateurId,
        contenu,
        parentId,
        pieceJointeCle: cle,
        pieceJointeNom: piece?.nom ?? null,
        pieceJointeType: piece?.mime ?? null,
        pieceJointeTaille: piece?.taille ?? null,
      })
      .returning({ id: messageCanal.id, creeLe: messageCanal.creeLe, misAJourLe: messageCanal.misAJourLe });

    // Une réponse fait « bouger » le message d'origine : la lecture incrémentale de la chronologie le renvoie avec son
    // nouveau nombre de réponses (horloge de la base, comme partout).
    if (parentId) await tx.update(messageCanal).set({ misAJourLe: sql`now()` }).where(eq(messageCanal.id, parentId));

    // Écrire dans un canal vaut lecture : on ne se compte pas ses propres messages comme non lus.
    await marquerCanalLu(tx, utilisateurConnecte.entrepriseId, canalId, utilisateurConnecte.utilisateurId);

    // Mentions : reconnues sur le texte, puis filtrées aux personnes qui peuvent VRAIMENT voir ce canal (un groupe privé
    // ou un projet hors portée ne fuit jamais vers quelqu'un qui n'y a pas accès).
    let aNotifier = leCanal.type === "DIRECT";
    // (Dans un message direct, l'email « vous a écrit » couvre déjà la personne : pas de mention en double.)
    if (contenu && leCanal.type !== "DIRECT") {
      const candidats = await candidatsMentions(tx, utilisateurConnecte, leCanal);
      const ids = extraireMentions(contenu, candidats).filter((id) => id !== utilisateurConnecte.utilisateurId);
      if (ids.length > 0) {
        const personnes = await tx
          .select({ id: utilisateur.id, role: utilisateur.role, modulesAutorises: utilisateur.modulesAutorises })
          .from(utilisateur)
          .where(and(eq(utilisateur.entrepriseId, utilisateurConnecte.entrepriseId), eq(utilisateur.statut, "ACTIF"), ne(utilisateur.role, "CLIENT"), inArray(utilisateur.id, ids)));
        const mentionnables: string[] = [];
        for (const p of personnes) {
          const pseudo = { utilisateurId: p.id, entrepriseId: utilisateurConnecte.entrepriseId, role: p.role, modulesAutorises: p.modulesAutorises as Module[] | null } as UtilisateurConnecte;
          if (await canalAccessible(tx, pseudo, canalId)) mentionnables.push(p.id);
        }
        if (mentionnables.length > 0) {
          await tx
            .insert(mentionMessage)
            .values(mentionnables.map((utilisateurId) => ({ entrepriseId: utilisateurConnecte.entrepriseId, messageId: cree.id, utilisateurId })))
            .onConflictDoNothing();
          aNotifier = true;
        }
      }
    }
    // Message direct ou mention : l'entreprise est marquée pour que le worker envoie, si besoin, l'email de notification.
    if (aNotifier) await signalerMessagesANotifier(tx, utilisateurConnecte.entrepriseId);

    const [auteur] = await tx.select({ nomComplet: utilisateur.nomComplet }).from(utilisateur).where(eq(utilisateur.id, utilisateurConnecte.utilisateurId));
    const message: MessageAffiche = {
      id: cree.id,
      auteurId: utilisateurConnecte.utilisateurId,
      auteurNom: auteur?.nomComplet ?? "",
      contenu,
      supprime: false,
      piece: piece ? { nom: piece.nom, type: piece.mime, taille: piece.taille, image: piece.mime.startsWith("image/") } : null,
      parentId,
      nbReponses: 0,
      reactions: [],
      creeLe: cree.creeLe.toISOString(),
      misAJourLe: cree.misAJourLe.toISOString(),
    };
    return { message };
  });
}

/**
 * Ajoute ou retire SA réaction (un emoji de la liste fermée) sur un message d'un canal qu'on peut voir. Le message
 * « bouge » (misAJourLe) pour que les autres reçoivent la réaction à leur prochaine lecture. Renvoie les réactions
 * à jour du message.
 */
export async function basculerReaction(messageId: string, emoji: string): Promise<{ reactions?: ReactionAffichee[]; erreur?: string }> {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte, "MESSAGERIE", "CREER")) return { erreur: "Vous n'avez pas le droit de réagir dans la messagerie." };
  if (!emojiValide(emoji)) return { erreur: "Cette réaction n'est pas proposée." };

  return avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [leMessage] = await tx
      .select({ canalId: messageCanal.canalId, supprimeLe: messageCanal.supprimeLe })
      .from(messageCanal)
      .where(and(eq(messageCanal.id, messageId), eq(messageCanal.entrepriseId, utilisateurConnecte.entrepriseId)));
    if (!leMessage || leMessage.supprimeLe) return { erreur: "Message introuvable." };
    if (!(await canalAccessible(tx, utilisateurConnecte, leMessage.canalId))) return { erreur: "Message introuvable." };

    const supprimees = await tx
      .delete(reactionMessage)
      .where(and(eq(reactionMessage.messageId, messageId), eq(reactionMessage.utilisateurId, utilisateurConnecte.utilisateurId), eq(reactionMessage.emoji, emoji)))
      .returning({ id: reactionMessage.id });
    if (supprimees.length === 0) {
      await tx.insert(reactionMessage).values({ entrepriseId: utilisateurConnecte.entrepriseId, messageId, utilisateurId: utilisateurConnecte.utilisateurId, emoji }).onConflictDoNothing();
    }
    await tx.update(messageCanal).set({ misAJourLe: sql`now()` }).where(eq(messageCanal.id, messageId));

    return { reactions: (await reactionsDe(tx, [messageId], utilisateurConnecte.utilisateurId)).get(messageId) ?? [] };
  });
}

/**
 * Supprime un message : son auteur, ou l'Administrateur (modération). Le texte est effacé pour de bon, la pièce jointe
 * aussi (base et stockage) ; la ligne reste pour garder le fil de la conversation.
 */
export async function supprimerMessage(messageId: string): Promise<{ erreur?: string }> {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");

  const resultat = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [leMessage] = await tx
      .select({ canalId: messageCanal.canalId, auteurId: messageCanal.auteurId, parentId: messageCanal.parentId, pieceCle: messageCanal.pieceJointeCle })
      .from(messageCanal)
      .where(and(eq(messageCanal.id, messageId), eq(messageCanal.entrepriseId, utilisateurConnecte.entrepriseId)));
    if (!leMessage) return { erreur: "Message introuvable." };
    if (!(await canalAccessible(tx, utilisateurConnecte, leMessage.canalId))) return { erreur: "Message introuvable." };
    if (leMessage.auteurId !== utilisateurConnecte.utilisateurId && utilisateurConnecte.role !== "ADMIN") return { erreur: "Vous ne pouvez supprimer que vos propres messages." };

    // Horloge de la base (now()), la même que celle des créations : la mise à jour incrémentale de la
    // conversation compare des horodatages, deux horloges différentes feraient manquer des changements.
    await tx
      .update(messageCanal)
      .set({ contenu: "", supprimeLe: sql`now()`, misAJourLe: sql`now()`, pieceJointeCle: null, pieceJointeNom: null, pieceJointeType: null, pieceJointeTaille: null })
      .where(and(eq(messageCanal.id, messageId), eq(messageCanal.entrepriseId, utilisateurConnecte.entrepriseId)));
    // Une réponse supprimée change le nombre de réponses de son message d'origine.
    if (leMessage.parentId) await tx.update(messageCanal).set({ misAJourLe: sql`now()` }).where(eq(messageCanal.id, leMessage.parentId));
    return { pieceCle: leMessage.pieceCle };
  });

  if ("erreur" in resultat) return { erreur: resultat.erreur };
  // Effacement réel du fichier, après la base : au pire un fichier orphelin, jamais un message qui pointe dans le vide.
  if (resultat.pieceCle) {
    try {
      await effacerObjetStockage(resultat.pieceCle);
    } catch (erreur) {
      console.error("[messagerie] effacement de la pièce jointe impossible :", erreur instanceof Error ? erreur.message : erreur);
    }
  }
  return {};
}

export type EtatNouveauCanal = { erreur?: string } | null;

/** Crée un canal libre, visible de toute l'entreprise. */
export async function creerCanalLibre(_etat: EtatNouveauCanal, formData: FormData): Promise<EtatNouveauCanal> {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte, "MESSAGERIE", "CREER")) return { erreur: "Vous n'avez pas le droit de créer un canal." };

  const nom = String(formData.get("nom") ?? "").trim().replace(/\s+/g, " ");
  if (nom.length < 2) return { erreur: "Le nom du canal est trop court." };
  if (nom.length > 60) return { erreur: "Le nom du canal est trop long (60 caractères au maximum)." };

  const resultat = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    if (!(await messagerieDisponible(tx, utilisateurConnecte))) return { erreur: "La messagerie n'est pas disponible pour votre entreprise." };
    const [cree] = await tx
      .insert(canal)
      .values({ entrepriseId: utilisateurConnecte.entrepriseId, nom, type: "LIBRE", idFournisseurChat: idExterneCanal(utilisateurConnecte.entrepriseId, generateRandomString(16, "a-z", "0-9")) })
      .returning({ id: canal.id });
    return { id: cree.id };
  });

  if ("erreur" in resultat) return { erreur: resultat.erreur };
  revalidatePath("/app/messagerie");
  redirect(`/app/messagerie?canal=${resultat.id}`);
}

/** Collègues valides parmi des identifiants reçus : même entreprise, actifs, jamais un client du portail. Relus en base. */
async function collèguesValides(tx: Parameters<Parameters<typeof avecEntreprise>[1]>[0], entrepriseId: string, ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const lignes = await tx
    .select({ id: utilisateur.id })
    .from(utilisateur)
    .where(and(eq(utilisateur.entrepriseId, entrepriseId), eq(utilisateur.statut, "ACTIF"), ne(utilisateur.role, "CLIENT"), inArray(utilisateur.id, ids)));
  return lignes.map((l) => l.id);
}

export type EtatGroupe = { erreur?: string } | null;

/**
 * Crée un groupe privé : visible de ses seuls membres (le créateur et les collègues choisis), même pas de
 * l'Administrateur. Le créateur en est le gestionnaire : lui seul ajoute ou retire des membres.
 */
export async function creerGroupePrive(_etat: EtatGroupe, formData: FormData): Promise<EtatGroupe> {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte, "MESSAGERIE", "CREER")) return { erreur: "Vous n'avez pas le droit de créer un groupe." };

  const nom = String(formData.get("nom") ?? "").trim().replace(/\s+/g, " ");
  if (nom.length < 2) return { erreur: "Le nom du groupe est trop court." };
  if (nom.length > 60) return { erreur: "Le nom du groupe est trop long (60 caractères au maximum)." };
  const demandes = [...new Set(formData.getAll("membres").map(String))].filter((id) => id !== utilisateurConnecte.utilisateurId).slice(0, 50);
  if (demandes.length === 0) return { erreur: "Choisissez au moins un collègue à inviter dans le groupe." };

  const resultat = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    if (!(await messagerieDisponible(tx, utilisateurConnecte))) return { erreur: "La messagerie n'est pas disponible pour votre entreprise." };
    const membres = await collèguesValides(tx, utilisateurConnecte.entrepriseId, demandes);
    if (membres.length === 0) return { erreur: "Aucun des collègues choisis n'est valide." };

    const [cree] = await tx
      .insert(canal)
      .values({
        entrepriseId: utilisateurConnecte.entrepriseId,
        nom,
        type: "PRIVE",
        creeParId: utilisateurConnecte.utilisateurId,
        idFournisseurChat: idExterneCanal(utilisateurConnecte.entrepriseId, `groupe-${generateRandomString(16, "a-z", "0-9")}`),
      })
      .returning({ id: canal.id });
    await tx.insert(membreCanal).values([utilisateurConnecte.utilisateurId, ...membres].map((utilisateurId) => ({ entrepriseId: utilisateurConnecte.entrepriseId, canalId: cree.id, utilisateurId })));
    return { id: cree.id };
  });

  if ("erreur" in resultat) return { erreur: resultat.erreur };
  revalidatePath("/app/messagerie");
  redirect(`/app/messagerie?canal=${resultat.id}`);
}

/** Groupe privé dont l'utilisateur est le créateur (seul autorisé à en gérer les membres), sinon null. */
async function groupeGere(tx: Parameters<Parameters<typeof avecEntreprise>[1]>[0], utilisateurConnecte: UtilisateurConnecte, canalId: string) {
  const leCanal = await canalAccessible(tx, utilisateurConnecte, canalId);
  if (!leCanal || leCanal.type !== "PRIVE" || leCanal.creeParId !== utilisateurConnecte.utilisateurId) return null;
  return leCanal;
}

/** Ajoute un collègue à un groupe privé — réservé au créateur du groupe. */
export async function ajouterMembreGroupe(canalId: string, utilisateurId: string): Promise<{ erreur?: string }> {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte, "MESSAGERIE", "CREER")) return { erreur: "Vous n'avez pas le droit de gérer un groupe." };

  const resultat = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    if (!(await groupeGere(tx, utilisateurConnecte, canalId))) return { erreur: "Seul le créateur du groupe peut y ajouter des membres." };
    const [valide] = await collèguesValides(tx, utilisateurConnecte.entrepriseId, [utilisateurId]);
    if (!valide) return { erreur: "Ce collègue est introuvable." };
    await tx.insert(membreCanal).values({ entrepriseId: utilisateurConnecte.entrepriseId, canalId, utilisateurId: valide }).onConflictDoNothing();
    return {};
  });
  if (!resultat.erreur) revalidatePath("/app/messagerie");
  return resultat;
}

/**
 * Retire un membre d'un groupe privé : le créateur retire qui il veut ; chaque membre peut se retirer lui-même
 * (quitter le groupe). Le créateur ne peut pas quitter son propre groupe. Les messages déjà écrits restent.
 */
export async function retirerMembreGroupe(canalId: string, utilisateurId: string): Promise<{ erreur?: string }> {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");

  const resultat = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const leCanal = await canalAccessible(tx, utilisateurConnecte, canalId);
    if (!leCanal || leCanal.type !== "PRIVE") return { erreur: "Groupe introuvable." };
    const estCreateur = leCanal.creeParId === utilisateurConnecte.utilisateurId;
    const seQuitte = utilisateurId === utilisateurConnecte.utilisateurId;
    if (!estCreateur && !seQuitte) return { erreur: "Seul le créateur du groupe peut retirer un autre membre." };
    if (utilisateurId === leCanal.creeParId) return { erreur: "Le créateur ne peut pas quitter son propre groupe." };
    await tx.delete(membreCanal).where(and(eq(membreCanal.canalId, canalId), eq(membreCanal.utilisateurId, utilisateurId), eq(membreCanal.entrepriseId, utilisateurConnecte.entrepriseId)));
    return {};
  });
  if (!resultat.erreur) revalidatePath("/app/messagerie");
  return resultat;
}
