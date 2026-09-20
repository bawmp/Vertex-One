import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import type { TransactionDrizzle } from "@/db/client";
import { canal, entreprise, lectureCanal, membreCanal, mentionMessage, messageCanal, utilisateur } from "@/db/schema";
import { envoyerEmail } from "@/lib/email/client";
import { echapper } from "@/lib/notifications/equipe";
import { urlBase } from "@/lib/client-documents/liens";

/** Un message direct n'est notifié par email que s'il est resté sans réponse ni lecture pendant ce délai. */
export const DELAI_NOTIFICATION_MINUTES = 3;

/**
 * Note que cette entreprise a des messages directs à notifier : le worker ne traite que les entreprises ainsi
 * marquées, au lieu de balayer toutes les entreprises toutes les quelques minutes. À appeler à l'envoi d'un
 * message direct. Sans effet si déjà marqué (on garde la date du plus ancien message en attente).
 */
export async function signalerMessagesANotifier(tx: TransactionDrizzle, entrepriseId: string): Promise<void> {
  await tx
    .update(entreprise)
    .set({ messagesANotifierDepuis: sql`now()` })
    .where(and(eq(entreprise.id, entrepriseId), isNull(entreprise.messagesANotifierDepuis)));
}

function extrait(texte: string, max = 200): string {
  const propre = texte.replace(/\s+/g, " ").trim();
  return propre.length > max ? `${propre.slice(0, max - 1)}…` : propre;
}

/**
 * Prévient par email les personnes @mentionnées qui n'ont pas lu le canal depuis le message (délai de trois minutes,
 * comme pour les messages directs). Un email par mention, jamais deux fois (notifie_le) ; une mention dont le message
 * a été supprimé, ou déjà lue, est simplement marquée traitée.
 */
async function notifierMentions(tx: TransactionDrizzle, entrepriseId: string): Promise<number> {
  const enAttente = await tx
    .select({
      id: mentionMessage.id,
      messageId: mentionMessage.messageId,
      utilisateurId: mentionMessage.utilisateurId,
      canalId: messageCanal.canalId,
      auteurId: messageCanal.auteurId,
      contenu: messageCanal.contenu,
      pieceNom: messageCanal.pieceJointeNom,
      supprimeLe: messageCanal.supprimeLe,
      creeLe: messageCanal.creeLe,
      canalNom: canal.nom,
      canalType: canal.type,
    })
    .from(mentionMessage)
    .innerJoin(messageCanal, eq(messageCanal.id, mentionMessage.messageId))
    .innerJoin(canal, eq(canal.id, messageCanal.canalId))
    .where(
      and(
        eq(mentionMessage.entrepriseId, entrepriseId),
        isNull(mentionMessage.notifieLe),
        sql`${messageCanal.creeLe} < now() - make_interval(mins => ${DELAI_NOTIFICATION_MINUTES})`
      )
    );
  if (enAttente.length === 0) return 0;

  const idsCanaux = [...new Set(enAttente.map((m) => m.canalId))];
  const idsPersonnes = [...new Set(enAttente.flatMap((m) => [m.utilisateurId, m.auteurId]))];
  const [lectures, personnes, [monEntreprise]] = await Promise.all([
    tx.select().from(lectureCanal).where(inArray(lectureCanal.canalId, idsCanaux)),
    tx.select({ id: utilisateur.id, nom: utilisateur.nomComplet, email: utilisateur.email, statut: utilisateur.statut }).from(utilisateur).where(and(eq(utilisateur.entrepriseId, entrepriseId), inArray(utilisateur.id, idsPersonnes))),
    tx.select({ nom: entreprise.nom }).from(entreprise).where(eq(entreprise.id, entrepriseId)),
  ]);

  let envoyes = 0;
  for (const m of enAttente) {
    if (m.supprimeLe) continue;
    const destinataire = personnes.find((p) => p.id === m.utilisateurId);
    const auteur = personnes.find((p) => p.id === m.auteurId);
    if (!destinataire?.email || destinataire.statut !== "ACTIF" || !auteur) continue;
    const lecture = lectures.find((l) => l.canalId === m.canalId && l.utilisateurId === m.utilisateurId);
    if (lecture && m.creeLe <= lecture.derniereLectureLe) continue; // déjà lu : rien à notifier

    const ou = m.canalType === "DIRECT" ? "dans un message direct" : m.canalType === "PRIVE" ? `dans le groupe « ${m.canalNom} »` : `dans #${m.canalNom}`;
    const apercu = m.contenu ? extrait(m.contenu) : m.pieceNom ? `Pièce jointe : ${m.pieceNom}` : "";
    const { envoye } = await envoyerEmail({
      to: destinataire.email,
      subject: `${auteur.nom} vous a mentionné(e) ${ou}`,
      html: `<p>Bonjour ${echapper(destinataire.nom)},</p><p><strong>${echapper(auteur.nom)}</strong> vous a mentionné(e) ${echapper(ou)} sur ${echapper(monEntreprise?.nom ?? "votre espace")} :</p><blockquote style="border-left:3px solid #ed7623;margin:8px 0;padding:4px 12px;color:#444">${echapper(apercu)}</blockquote><p><a href="${urlBase()}/app/messagerie?canal=${m.canalId}&message=${m.messageId}">Voir dans One Chat</a></p>`,
    }).catch(() => ({ envoye: false }));
    if (envoye) envoyes++;
  }

  await tx.update(mentionMessage).set({ notifieLe: sql`now()` }).where(inArray(mentionMessage.id, enAttente.map((m) => m.id)));
  return envoyes;
}

/**
 * Notifie par email les destinataires de messages directs restés non lus depuis plus de trois minutes. Un email
 * par conversation et par destinataire (« 3 nouveaux messages de Alice »), jamais un par message ; un message
 * n'est jamais notifié deux fois (notifie_le). Un message déjà lu à l'échéance est simplement marqué traité.
 * Appelée par le worker, dans avecEntreprise() : uniquement les données de CETTE entreprise.
 */
export async function notifierMessagesDirects(tx: TransactionDrizzle, entrepriseId: string): Promise<{ emailsEnvoyes: number }> {
  const enAttente = await tx
    .select({
      id: messageCanal.id,
      canalId: messageCanal.canalId,
      auteurId: messageCanal.auteurId,
      contenu: messageCanal.contenu,
      pieceNom: messageCanal.pieceJointeNom,
      creeLe: messageCanal.creeLe,
    })
    .from(messageCanal)
    .innerJoin(canal, eq(canal.id, messageCanal.canalId))
    .where(
      and(
        eq(messageCanal.entrepriseId, entrepriseId),
        eq(canal.type, "DIRECT"),
        isNull(messageCanal.notifieLe),
        isNull(messageCanal.supprimeLe),
        sql`${messageCanal.creeLe} < now() - make_interval(mins => ${DELAI_NOTIFICATION_MINUTES})`
      )
    );

  let emailsEnvoyes = 0;
  if (enAttente.length > 0) {
    const idsCanaux = [...new Set(enAttente.map((m) => m.canalId))];
    const [membres, lectures, [monEntreprise]] = await Promise.all([
      tx.select({ canalId: membreCanal.canalId, utilisateurId: membreCanal.utilisateurId }).from(membreCanal).where(inArray(membreCanal.canalId, idsCanaux)),
      tx.select().from(lectureCanal).where(inArray(lectureCanal.canalId, idsCanaux)),
      tx.select({ nom: entreprise.nom }).from(entreprise).where(eq(entreprise.id, entrepriseId)),
    ]);

    // Regroupe par (conversation, destinataire) : le destinataire est le membre qui n'est pas l'auteur.
    const groupes = new Map<string, { canalId: string; destinataireId: string; auteurId: string; messages: typeof enAttente }>();
    for (const m of enAttente) {
      const destinataire = membres.find((x) => x.canalId === m.canalId && x.utilisateurId !== m.auteurId);
      if (!destinataire) continue;
      const cle = `${m.canalId}:${destinataire.utilisateurId}`;
      const groupe = groupes.get(cle) ?? { canalId: m.canalId, destinataireId: destinataire.utilisateurId, auteurId: m.auteurId, messages: [] };
      groupe.messages.push(m);
      groupes.set(cle, groupe);
    }

    const idsPersonnes = [...new Set([...groupes.values()].flatMap((g) => [g.destinataireId, g.auteurId]))];
    const personnes = idsPersonnes.length
      ? await tx.select({ id: utilisateur.id, nom: utilisateur.nomComplet, email: utilisateur.email, statut: utilisateur.statut }).from(utilisateur).where(and(eq(utilisateur.entrepriseId, entrepriseId), inArray(utilisateur.id, idsPersonnes)))
      : [];

    for (const g of groupes.values()) {
      const destinataire = personnes.find((p) => p.id === g.destinataireId);
      const auteur = personnes.find((p) => p.id === g.auteurId);
      if (!destinataire?.email || destinataire.statut !== "ACTIF" || !auteur) continue;

      const lecture = lectures.find((l) => l.canalId === g.canalId && l.utilisateurId === g.destinataireId);
      const nonLus = g.messages.filter((m) => !lecture || m.creeLe > lecture.derniereLectureLe);
      if (nonLus.length === 0) continue; // déjà lu : rien à notifier

      const dernier = nonLus[nonLus.length - 1];
      const apercu = dernier.contenu ? extrait(dernier.contenu) : dernier.pieceNom ? `Pièce jointe : ${dernier.pieceNom}` : "";
      const sujet = nonLus.length === 1 ? `${auteur.nom} vous a écrit sur Vertex One` : `${nonLus.length} nouveaux messages de ${auteur.nom} sur Vertex One`;
      const { envoye } = await envoyerEmail({
        to: destinataire.email,
        subject: sujet,
        html: `<p>Bonjour ${echapper(destinataire.nom)},</p><p><strong>${echapper(auteur.nom)}</strong> vous a envoyé ${nonLus.length === 1 ? "un message" : `${nonLus.length} messages`} sur ${echapper(monEntreprise?.nom ?? "votre espace")} :</p><blockquote style="border-left:3px solid #ed7623;margin:8px 0;padding:4px 12px;color:#444">${echapper(apercu)}</blockquote><p><a href="${urlBase()}/app/messagerie?canal=${g.canalId}">Répondre dans One Chat</a></p>`,
      }).catch(() => ({ envoye: false }));
      if (envoye) emailsEnvoyes++;
    }

    // Tous les messages examinés sont marqués traités : lus, notifiés ou sans destinataire joignable.
    await tx.update(messageCanal).set({ notifieLe: sql`now()` }).where(inArray(messageCanal.id, enAttente.map((m) => m.id)));
  }

  emailsEnvoyes += await notifierMentions(tx, entrepriseId);

  // Plus rien d'en attente (même récent) : l'entreprise n'a plus besoin d'être visitée par le worker.
  const [reste] = await tx
    .select({ id: messageCanal.id })
    .from(messageCanal)
    .innerJoin(canal, eq(canal.id, messageCanal.canalId))
    .where(and(eq(messageCanal.entrepriseId, entrepriseId), eq(canal.type, "DIRECT"), isNull(messageCanal.notifieLe), isNull(messageCanal.supprimeLe)))
    .limit(1);
  const [resteMention] = await tx.select({ id: mentionMessage.id }).from(mentionMessage).where(and(eq(mentionMessage.entrepriseId, entrepriseId), isNull(mentionMessage.notifieLe))).limit(1);
  if (!reste && !resteMention) await tx.update(entreprise).set({ messagesANotifierDepuis: null }).where(eq(entreprise.id, entrepriseId));

  return { emailsEnvoyes };
}
