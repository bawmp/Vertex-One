import { describe, test, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { abonnementPush, canal, canalSourdine, entreprise, lectureCanal, membreCanal, mentionMessage, messageCanal, preferenceNotification, utilisateur } from "@/db/schema";
import { assurerCanalGeneral, ouvrirConversationDirecte } from "@/lib/messagerie/acces";
import { doitNotifier, notifierNouveauMessage } from "@/lib/messagerie/push";
import { idExterneCanal } from "@/lib/chat/client";
import type { UtilisateurConnecte } from "@/lib/session";

// Le service de push est simulé : on vérifie QUI est prévenu, sur QUEL appareil et AVEC QUOI, sans réseau.
const { envois, statutParEndpoint } = vi.hoisted(() => ({
  envois: [] as { endpoint: string; charge: { titre: string; corps: string; url: string; tag: string; son: boolean } }[],
  statutParEndpoint: new Map<string, number>(),
}));
vi.mock("web-push", () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn(async (abonnement: { endpoint: string }, texte: string) => {
      const statut = statutParEndpoint.get(abonnement.endpoint);
      if (statut) throw Object.assign(new Error(`push ${statut}`), { statusCode: statut });
      envois.push({ endpoint: abonnement.endpoint, charge: JSON.parse(texte) });
    }),
  },
}));

describe("One Chat — règle de notification (pure)", () => {
  test("niveaux, canaux, mentions et sourdine", () => {
    const base = { mentionne: false, sourdine: false };
    // PRIVE_MENTIONS (défaut) : directs et groupes privés, pas les canaux ouverts
    expect(doitNotifier({ ...base, niveau: "PRIVE_MENTIONS", typeCanal: "DIRECT" })).toBe(true);
    expect(doitNotifier({ ...base, niveau: "PRIVE_MENTIONS", typeCanal: "PRIVE" })).toBe(true);
    expect(doitNotifier({ ...base, niveau: "PRIVE_MENTIONS", typeCanal: "EQUIPE" })).toBe(false);
    // DIRECTS_MENTIONS : seulement les directs
    expect(doitNotifier({ ...base, niveau: "DIRECTS_MENTIONS", typeCanal: "DIRECT" })).toBe(true);
    expect(doitNotifier({ ...base, niveau: "DIRECTS_MENTIONS", typeCanal: "PRIVE" })).toBe(false);
    // TOUT : tout
    expect(doitNotifier({ ...base, niveau: "TOUT", typeCanal: "LIBRE" })).toBe(true);
    // Une mention passe partout, même un canal ouvert ou une sourdine — sauf « aucune »
    expect(doitNotifier({ niveau: "DIRECTS_MENTIONS", typeCanal: "EQUIPE", mentionne: true, sourdine: false })).toBe(true);
    expect(doitNotifier({ niveau: "TOUT", typeCanal: "DIRECT", mentionne: true, sourdine: true })).toBe(true);
    expect(doitNotifier({ niveau: "AUCUNE", typeCanal: "DIRECT", mentionne: true, sourdine: false })).toBe(false);
    // Sourdine : plus rien sans mention
    expect(doitNotifier({ niveau: "TOUT", typeCanal: "DIRECT", mentionne: false, sourdine: true })).toBe(false);
  });
});

describe("One Chat — notifications push (base réelle, service de push simulé)", () => {
  const suffixe = Math.random().toString(36).slice(2, 8);
  let entrepriseA: string;
  let entrepriseB: string;
  let alice: UtilisateurConnecte;
  let bob: UtilisateurConnecte;
  let carol: UtilisateurConnecte;
  let dave: UtilisateurConnecte;
  let erin: UtilisateurConnecte; // autre entreprise
  let canalDirect: string;
  let canalGeneral: string;
  let groupe: string;
  const ep = (nom: string) => `https://push.example.test/${suffixe}/${nom}`;

  const message = async (canalId: string, contenu: string, auteur = alice) => {
    const [m] = await avecEntreprise(entrepriseA, (tx) => tx.insert(messageCanal).values({ entrepriseId: entrepriseA, canalId, auteurId: auteur.utilisateurId, contenu }).returning({ id: messageCanal.id }));
    return m.id;
  };
  const notifier = async (canalId: string, messageId: string, contenu: string, auteur = alice) => notifierNouveauMessage({ entrepriseId: entrepriseA, canalId, messageId, auteurId: auteur.utilisateurId, contenu, pieceNom: null });
  const endpointsPrevenus = () => envois.map((e) => e.endpoint).sort();

  beforeAll(async () => {
    process.env.VAPID_PUBLIC_KEY = "cle-publique-de-test";
    process.env.VAPID_PRIVATE_KEY = "cle-privee-de-test";
    const creerEntreprise = async (nom: string) => (await db.insert(entreprise).values({ nom, secteurProfil: "agence" }).returning({ id: entreprise.id }))[0].id;
    entrepriseA = await creerEntreprise("TEST Push A");
    entrepriseB = await creerEntreprise("TEST Push B");
    const creer = async (entrepriseId: string, nom: string) => {
      const [u] = await db.insert(utilisateur).values({ entrepriseId, email: `${nom}-push-${suffixe}@vertexone.test`, nomComplet: nom, role: "EMPLOYE" }).returning({ id: utilisateur.id });
      return { utilisateurId: u.id, entrepriseId, role: "EMPLOYE" } as UtilisateurConnecte;
    };
    alice = await creer(entrepriseA, "Alice");
    bob = await creer(entrepriseA, "Bob");
    carol = await creer(entrepriseA, "Carol");
    dave = await creer(entrepriseA, "Dave");
    erin = await creer(entrepriseB, "Erin");

    canalDirect = (await avecEntreprise(entrepriseA, (tx) => ouvrirConversationDirecte(tx, alice, bob.utilisateurId)))!;
    await avecEntreprise(entrepriseA, (tx) => assurerCanalGeneral(tx, entrepriseA));
    [{ id: canalGeneral }] = await avecEntreprise(entrepriseA, (tx) => tx.select({ id: canal.id }).from(canal).where(and(eq(canal.entrepriseId, entrepriseA), eq(canal.type, "EQUIPE"))));
    // Groupe privé : Alice, Bob et Carol (pas Dave)
    [{ id: groupe }] = await avecEntreprise(entrepriseA, (tx) =>
      tx.insert(canal).values({ entrepriseId: entrepriseA, nom: "Projet secret", type: "PRIVE", idFournisseurChat: idExterneCanal(entrepriseA, `groupe-${suffixe}`), creeParId: alice.utilisateurId }).returning({ id: canal.id })
    );
    await avecEntreprise(entrepriseA, (tx) => tx.insert(membreCanal).values([alice, bob, carol].map((u) => ({ entrepriseId: entrepriseA, canalId: groupe, utilisateurId: u.utilisateurId }))));

    // Un appareil par personne (Erin est dans une AUTRE entreprise)
    for (const [u, nom] of [[alice, "alice"], [bob, "bob"], [carol, "carol"], [dave, "dave"]] as const) {
      await avecEntreprise(entrepriseA, (tx) => tx.insert(abonnementPush).values({ entrepriseId: entrepriseA, utilisateurId: u.utilisateurId, endpoint: ep(nom), cleP256dh: "p256dh-test-xxxxxxxxxxxxxxxx", cleAuth: "auth-test-xxxx", agent: "Test" }));
    }
    await avecEntreprise(entrepriseB, (tx) => tx.insert(abonnementPush).values({ entrepriseId: entrepriseB, utilisateurId: erin.utilisateurId, endpoint: ep("erin"), cleP256dh: "p256dh-test-xxxxxxxxxxxxxxxx", cleAuth: "auth-test-xxxx" }));
    // Carol choisit « tous les messages »
    await avecEntreprise(entrepriseA, (tx) => tx.insert(preferenceNotification).values({ entrepriseId: entrepriseA, utilisateurId: carol.utilisateurId, niveau: "TOUT" }));
  }, 120_000);

  beforeEach(() => {
    envois.length = 0;
    statutParEndpoint.clear();
  });

  afterAll(async () => {
    for (const id of [entrepriseA, entrepriseB]) {
      await avecEntreprise(id, async (tx) => {
        await tx.delete(abonnementPush).where(eq(abonnementPush.entrepriseId, id));
        await tx.delete(preferenceNotification).where(eq(preferenceNotification.entrepriseId, id));
        await tx.delete(canalSourdine).where(eq(canalSourdine.entrepriseId, id));
        await tx.delete(mentionMessage).where(eq(mentionMessage.entrepriseId, id));
        await tx.delete(lectureCanal).where(eq(lectureCanal.entrepriseId, id));
        await tx.update(messageCanal).set({ citeMessageId: null }).where(eq(messageCanal.entrepriseId, id));
        await tx.delete(messageCanal).where(eq(messageCanal.entrepriseId, id));
        await tx.delete(membreCanal).where(eq(membreCanal.entrepriseId, id));
        await tx.delete(canal).where(eq(canal.entrepriseId, id));
      });
      await db.delete(utilisateur).where(eq(utilisateur.entrepriseId, id));
      await db.delete(entreprise).where(eq(entreprise.id, id));
    }
  }, 120_000);

  test("message direct : seul l'interlocuteur est prévenu (jamais l'auteur, ni un tiers qui a choisi « tout »)", async () => {
    const id = await message(canalDirect, "Salut Bob, tu as vu le devis ?");
    const r = await notifier(canalDirect, id, "Salut Bob, tu as vu le devis ?");
    expect(r.envoyes).toBe(1);
    expect(endpointsPrevenus()).toEqual([ep("bob")]);
    expect(envois[0].charge.titre).toBe("Alice");
    expect(envois[0].charge.corps).toContain("devis");
    expect(envois[0].charge.url).toBe(`/app/messagerie?canal=${canalDirect}&message=${id}`);
  }, 90_000);

  test("groupe privé : les membres sont prévenus, pas un non-membre", async () => {
    const id = await message(groupe, "Point à 15h");
    await notifier(groupe, id, "Point à 15h");
    expect(endpointsPrevenus()).toEqual([ep("bob"), ep("carol")]);
    expect(envois[0].charge.titre).toContain("Projet secret");
    expect(envois.some((e) => e.endpoint === ep("dave"))).toBe(false);
  }, 90_000);

  test("canal ouvert : seule la personne qui a choisi « tous les messages » est prévenue", async () => {
    const id = await message(canalGeneral, "Bonne journée à tous");
    await notifier(canalGeneral, id, "Bonne journée à tous");
    expect(endpointsPrevenus()).toEqual([ep("carol")]);
  }, 90_000);

  test("une @mention prévient la personne mentionnée même dans un canal ouvert ; la sourdine n'empêche pas une mention", async () => {
    const id = await message(canalGeneral, "Bob, regarde ça");
    await avecEntreprise(entrepriseA, (tx) => tx.insert(mentionMessage).values({ entrepriseId: entrepriseA, messageId: id, utilisateurId: bob.utilisateurId }));
    await avecEntreprise(entrepriseA, (tx) => tx.insert(canalSourdine).values({ entrepriseId: entrepriseA, utilisateurId: bob.utilisateurId, canalId: canalGeneral }));
    await avecEntreprise(entrepriseA, (tx) => tx.insert(canalSourdine).values({ entrepriseId: entrepriseA, utilisateurId: carol.utilisateurId, canalId: canalGeneral }));
    await notifier(canalGeneral, id, "Bob, regarde ça");
    // Bob (mentionné, canal en sourdine) est prévenu ; Carol (tout, mais canal en sourdine, non mentionnée) ne l'est pas.
    expect(endpointsPrevenus()).toEqual([ep("bob")]);
    expect(envois[0].charge.titre).toContain("vous a mentionné");
    await avecEntreprise(entrepriseA, (tx) => tx.delete(canalSourdine).where(eq(canalSourdine.entrepriseId, entrepriseA)));
  }, 90_000);

  test("répondre à un message précis prévient son auteur, même dans un canal ouvert, avec un titre adapté", async () => {
    const original = await message(canalGeneral, "Qui prend le dossier ?", bob);
    const [reponse] = await avecEntreprise(entrepriseA, (tx) =>
      tx.insert(messageCanal).values({ entrepriseId: entrepriseA, canalId: canalGeneral, auteurId: alice.utilisateurId, contenu: "Moi", citeMessageId: original }).returning({ id: messageCanal.id })
    );
    // Ce que fait l'action envoyerMessage : l'auteur du message cité est prévenu comme une mention.
    await avecEntreprise(entrepriseA, (tx) => tx.insert(mentionMessage).values({ entrepriseId: entrepriseA, messageId: reponse.id, utilisateurId: bob.utilisateurId }));
    await notifier(canalGeneral, reponse.id, "Moi");
    expect(endpointsPrevenus()).toEqual([ep("bob"), ep("carol")]);
    expect(envois.find((e) => e.endpoint === ep("bob"))!.charge.titre).toContain("a répondu à votre message");
    expect(envois.find((e) => e.endpoint === ep("carol"))!.charge.titre).not.toContain("répondu");
  }, 90_000);

  test("« aucune notification » : rien, même en cas de mention ; sans aperçu : texte masqué", async () => {
    await avecEntreprise(entrepriseA, (tx) => tx.update(preferenceNotification).set({ niveau: "AUCUNE" }).where(eq(preferenceNotification.utilisateurId, carol.utilisateurId)));
    const id1 = await message(groupe, "Pour Carol");
    await avecEntreprise(entrepriseA, (tx) => tx.insert(mentionMessage).values({ entrepriseId: entrepriseA, messageId: id1, utilisateurId: carol.utilisateurId }));
    await notifier(groupe, id1, "Pour Carol");
    expect(envois.some((e) => e.endpoint === ep("carol"))).toBe(false);

    envois.length = 0;
    await avecEntreprise(entrepriseA, (tx) => tx.insert(preferenceNotification).values({ entrepriseId: entrepriseA, utilisateurId: bob.utilisateurId, apercu: false, son: false }));
    const id2 = await message(canalDirect, "Mot de passe : 1234");
    await notifier(canalDirect, id2, "Mot de passe : 1234");
    expect(envois).toHaveLength(1);
    expect(envois[0].charge.corps).toBe("Nouveau message");
    expect(JSON.stringify(envois[0].charge)).not.toContain("1234");
    expect(envois[0].charge.son).toBe(false);
    await avecEntreprise(entrepriseA, (tx) => tx.update(preferenceNotification).set({ niveau: "TOUT" }).where(eq(preferenceNotification.utilisateurId, carol.utilisateurId)));
    await avecEntreprise(entrepriseA, (tx) => tx.delete(preferenceNotification).where(eq(preferenceNotification.utilisateurId, bob.utilisateurId)));
  }, 90_000);

  test("un appareil dont l'adresse a expiré (410) est supprimé, sans faire échouer les autres envois", async () => {
    statutParEndpoint.set(ep("bob"), 410);
    const id = await message(canalDirect, "Tu me reçois ?");
    const r = await notifier(canalDirect, id, "Tu me reçois ?");
    expect(r.expires).toBe(1);
    const restants = await avecEntreprise(entrepriseA, (tx) => tx.select({ endpoint: abonnementPush.endpoint }).from(abonnementPush).where(eq(abonnementPush.utilisateurId, bob.utilisateurId)));
    expect(restants).toHaveLength(0);
  }, 90_000);

  test("FUITE ENTRE ENTREPRISES : l'autre entreprise ne voit ni ne crée d'abonnement, de réglage ni de sourdine de la première", async () => {
    const vusParB = await avecEntreprise(entrepriseB, (tx) => tx.select({ endpoint: abonnementPush.endpoint }).from(abonnementPush));
    expect(vusParB.map((v) => v.endpoint)).toEqual([ep("erin")]);
    const prefsVuesParB = await avecEntreprise(entrepriseB, (tx) => tx.select().from(preferenceNotification));
    expect(prefsVuesParB).toHaveLength(0);
    // Écrire une ligne au nom de l'entreprise A depuis le contexte B est refusé par la base (WITH CHECK).
    await expect(
      avecEntreprise(entrepriseB, (tx) => tx.insert(abonnementPush).values({ entrepriseId: entrepriseA, utilisateurId: alice.utilisateurId, endpoint: ep("intrus"), cleP256dh: "p256dh-test-xxxxxxxxxxxxxxxx", cleAuth: "auth-test-xxxx" }))
    ).rejects.toThrow();
    await expect(
      avecEntreprise(entrepriseB, (tx) => tx.insert(canalSourdine).values({ entrepriseId: entrepriseA, utilisateurId: alice.utilisateurId, canalId: canalGeneral }))
    ).rejects.toThrow();
    // Et un message de l'entreprise A ne prévient jamais Erin.
    envois.length = 0;
    const id = await message(canalGeneral, "Message interne");
    await notifier(canalGeneral, id, "Message interne");
    expect(envois.some((e) => e.endpoint === ep("erin"))).toBe(false);
  }, 90_000);
});
