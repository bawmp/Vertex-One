import { describe, test, expect, beforeAll, afterAll, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, utilisateur, canal, messageCanal, membreCanal, lectureCanal, mentionMessage } from "@/db/schema";
import { marquerCanalLu, ouvrirConversationDirecte } from "@/lib/messagerie/acces";
import { notifierMessagesDirects, signalerMessagesANotifier } from "@/lib/messagerie/notifications";
import type { UtilisateurConnecte } from "@/lib/session";

// L'envoi d'email est simulé : on vérifie QUI est prévenu, QUAND et QUOI, sans dépendre de Resend.
const { emails } = vi.hoisted(() => ({ emails: [] as { to: string; subject: string; html: string }[] }));
vi.mock("@/lib/email/client", () => ({
  envoyerEmail: vi.fn(async (params: { to: string; subject: string; html: string }) => {
    emails.push(params);
    return { envoye: true };
  }),
}));

describe("One Chat — notification par email des messages directs restés non lus", () => {
  let entrepriseId: string;
  let alice: UtilisateurConnecte;
  let bob: UtilisateurConnecte;
  let canalId: string;
  const suffixe = Math.random().toString(36).slice(2, 8);
  const emailBob = `bob-notif-${suffixe}@vertexone.test`;
  const ilYa = (minutes: number) => new Date(Date.now() - minutes * 60_000);

  beforeAll(async () => {
    const [e] = await db.insert(entreprise).values({ nom: "TEST Chat Notifications", secteurProfil: "agence" }).returning({ id: entreprise.id });
    entrepriseId = e.id;
    const creer = async (email: string, nomComplet: string) => {
      const [u] = await db.insert(utilisateur).values({ entrepriseId, email, nomComplet, role: "EMPLOYE" }).returning({ id: utilisateur.id });
      return { utilisateurId: u.id, entrepriseId, role: "EMPLOYE" } as UtilisateurConnecte;
    };
    alice = await creer(`alice-notif-${suffixe}@vertexone.test`, "Alice <Test>");
    bob = await creer(emailBob, "Bob Notifié");
    canalId = (await avecEntreprise(entrepriseId, (tx) => ouvrirConversationDirecte(tx, alice, bob.utilisateurId)))!;
  }, 90_000);

  afterAll(async () => {
    await avecEntreprise(entrepriseId, async (tx) => {
      await tx.delete(mentionMessage).where(eq(mentionMessage.entrepriseId, entrepriseId));
      await tx.delete(lectureCanal).where(eq(lectureCanal.entrepriseId, entrepriseId));
      await tx.delete(messageCanal).where(eq(messageCanal.entrepriseId, entrepriseId));
      await tx.delete(membreCanal).where(eq(membreCanal.entrepriseId, entrepriseId));
      await tx.delete(canal).where(eq(canal.entrepriseId, entrepriseId));
    });
    await db.delete(utilisateur).where(eq(utilisateur.entrepriseId, entrepriseId));
    await db.delete(entreprise).where(eq(entreprise.id, entrepriseId));
  }, 90_000);

  test("un message tout récent (moins de 3 minutes) n'est pas encore notifié", async () => {
    emails.length = 0;
    await avecEntreprise(entrepriseId, (tx) => tx.insert(messageCanal).values({ entrepriseId, canalId, auteurId: alice.utilisateurId, contenu: "Message tout frais" }));
    const { emailsEnvoyes } = await avecEntreprise(entrepriseId, (tx) => notifierMessagesDirects(tx, entrepriseId));
    expect(emailsEnvoyes).toBe(0);
    expect(emails).toHaveLength(0);
  }, 90_000);

  test("plusieurs messages non lus depuis plus de 3 minutes : UN seul email au destinataire, jamais à l'auteur", async () => {
    emails.length = 0;
    await avecEntreprise(entrepriseId, (tx) =>
      tx.insert(messageCanal).values([
        { entrepriseId, canalId, auteurId: alice.utilisateurId, contenu: "Bonjour Bob", creeLe: ilYa(10) },
        { entrepriseId, canalId, auteurId: alice.utilisateurId, contenu: "Tu as vu <script>alert(1)</script> ?", creeLe: ilYa(9) },
        { entrepriseId, canalId, auteurId: alice.utilisateurId, contenu: "Réponds-moi stp", creeLe: ilYa(8) },
      ])
    );
    // Le message « tout frais » du test précédent ne date toujours pas de 3 minutes : il reste pour plus tard.
    const { emailsEnvoyes } = await avecEntreprise(entrepriseId, (tx) => notifierMessagesDirects(tx, entrepriseId));
    expect(emailsEnvoyes).toBe(1);
    expect(emails).toHaveLength(1);
    expect(emails[0].to).toBe(emailBob);
    expect(emails[0].subject).toContain("3 nouveaux messages");
    expect(emails[0].html).toContain("Réponds-moi stp"); // aperçu du dernier message
    expect(emails[0].html).toContain(`/app/messagerie?canal=${canalId}`);
    // Le nom et le texte saisis par un tiers sont échappés : aucun HTML brut injecté dans l'email.
    expect(emails[0].html).not.toContain("<Test>");
    expect(emails[0].html).toContain("&lt;Test&gt;");
  }, 90_000);

  test("un message n'est jamais notifié deux fois", async () => {
    emails.length = 0;
    const { emailsEnvoyes } = await avecEntreprise(entrepriseId, (tx) => notifierMessagesDirects(tx, entrepriseId));
    expect(emailsEnvoyes).toBe(0);
    expect(emails).toHaveLength(0);
  }, 90_000);

  test("un message déjà lu à l'échéance ne déclenche aucun email (mais est marqué traité)", async () => {
    emails.length = 0;
    const [ancien] = await avecEntreprise(entrepriseId, (tx) =>
      tx.insert(messageCanal).values({ entrepriseId, canalId, auteurId: alice.utilisateurId, contenu: "Déjà lu", creeLe: ilYa(20) }).returning({ id: messageCanal.id })
    );
    await avecEntreprise(entrepriseId, (tx) => marquerCanalLu(tx, entrepriseId, canalId, bob.utilisateurId)); // Bob a ouvert la conversation
    const { emailsEnvoyes } = await avecEntreprise(entrepriseId, (tx) => notifierMessagesDirects(tx, entrepriseId));
    expect(emailsEnvoyes).toBe(0);
    const [ligne] = await avecEntreprise(entrepriseId, (tx) => tx.select({ notifieLe: messageCanal.notifieLe }).from(messageCanal).where(eq(messageCanal.id, ancien.id)));
    expect(ligne.notifieLe).not.toBeNull();
  }, 90_000);

  test("un message supprimé n'est jamais notifié", async () => {
    emails.length = 0;
    await avecEntreprise(entrepriseId, (tx) =>
      tx.insert(messageCanal).values({ entrepriseId, canalId, auteurId: alice.utilisateurId, contenu: "", supprimeLe: new Date(), creeLe: ilYa(30) })
    );
    const { emailsEnvoyes } = await avecEntreprise(entrepriseId, (tx) => notifierMessagesDirects(tx, entrepriseId));
    expect(emailsEnvoyes).toBe(0);
    expect(emails).toHaveLength(0);
  }, 90_000);

  test("signalerMessagesANotifier marque l'entreprise une seule fois, et le worker la libère quand plus rien n'attend", async () => {
    await avecEntreprise(entrepriseId, (tx) => signalerMessagesANotifier(tx, entrepriseId));
    const [marquee] = await db.select({ depuis: entreprise.messagesANotifierDepuis }).from(entreprise).where(eq(entreprise.id, entrepriseId));
    expect(marquee.depuis).not.toBeNull();

    // Il reste le message « tout frais » (non échu) : l'entreprise reste marquée.
    await avecEntreprise(entrepriseId, (tx) => notifierMessagesDirects(tx, entrepriseId));
    const [encore] = await db.select({ depuis: entreprise.messagesANotifierDepuis }).from(entreprise).where(eq(entreprise.id, entrepriseId));
    expect(encore.depuis).not.toBeNull();

    // Quand ce dernier message est traité, plus rien n'attend : l'entreprise est libérée.
    await avecEntreprise(entrepriseId, (tx) => tx.update(messageCanal).set({ notifieLe: new Date() }).where(eq(messageCanal.canalId, canalId)));
    await avecEntreprise(entrepriseId, (tx) => notifierMessagesDirects(tx, entrepriseId));
    const [libre] = await db.select({ depuis: entreprise.messagesANotifierDepuis }).from(entreprise).where(eq(entreprise.id, entrepriseId));
    expect(libre.depuis).toBeNull();
  }, 90_000);

  // ----- Mentions -----

  test("mention : un email si la personne mentionnée n'a pas lu le canal après 3 minutes, jamais deux fois, jamais si supprimé ou déjà lu", async () => {
    // Nettoie l'état des tests précédents : tout est traité, aucune lecture de Bob.
    await avecEntreprise(entrepriseId, async (tx) => {
      await tx.update(messageCanal).set({ notifieLe: new Date() }).where(eq(messageCanal.entrepriseId, entrepriseId));
      await tx.delete(lectureCanal).where(eq(lectureCanal.entrepriseId, entrepriseId));
    });
    const [canalOuvert] = await avecEntreprise(entrepriseId, (tx) =>
      tx.insert(canal).values({ entrepriseId, nom: "Idées", type: "LIBRE", idFournisseurChat: `${entrepriseId}__idees-${suffixe}` }).returning({ id: canal.id })
    );
    const ecrire = (contenu: string, minutes: number, extra: Partial<typeof messageCanal.$inferInsert> = {}) =>
      avecEntreprise(entrepriseId, async (tx) => {
        const [m] = await tx.insert(messageCanal).values({ entrepriseId, canalId: canalOuvert.id, auteurId: alice.utilisateurId, contenu, creeLe: ilYa(minutes), ...extra }).returning({ id: messageCanal.id });
        await tx.insert(mentionMessage).values({ entrepriseId, messageId: m.id, utilisateurId: bob.utilisateurId });
        return m.id;
      });

    emails.length = 0;
    const recent = await ecrire("Mention toute fraîche @Bob Notifié", 1);
    const echu = await ecrire("Tu peux regarder ça @Bob Notifié ?", 10);
    const supprime = await ecrire("", 12, { supprimeLe: new Date() });
    void recent;
    void supprime;

    const { emailsEnvoyes } = await avecEntreprise(entrepriseId, (tx) => notifierMessagesDirects(tx, entrepriseId));
    expect(emailsEnvoyes).toBe(1); // seule la mention échue, non lue et non supprimée
    expect(emails).toHaveLength(1);
    expect(emails[0].to).toBe(emailBob);
    expect(emails[0].subject).toContain("vous a mentionné");
    expect(emails[0].subject).toContain("#Idées");
    expect(emails[0].html).toContain("Tu peux regarder ça");
    expect(emails[0].html).toContain(`canal=${canalOuvert.id}&message=${echu}`);
    expect(emails[0].html).not.toContain("<Test>"); // nom de l'auteur échappé

    // Jamais deux fois.
    emails.length = 0;
    await avecEntreprise(entrepriseId, (tx) => notifierMessagesDirects(tx, entrepriseId));
    expect(emails).toHaveLength(0);

    // Une mention échue mais déjà lue (Bob a ouvert le canal depuis) ne déclenche aucun email.
    await ecrire("Autre mention @Bob Notifié", 8);
    await avecEntreprise(entrepriseId, (tx) => marquerCanalLu(tx, entrepriseId, canalOuvert.id, bob.utilisateurId));
    await avecEntreprise(entrepriseId, (tx) => notifierMessagesDirects(tx, entrepriseId));
    expect(emails).toHaveLength(0);
  }, 120_000);

});
