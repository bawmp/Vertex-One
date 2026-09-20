import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, utilisateur, canal, messageCanal, membreCanal, reactionMessage, mentionMessage, lectureCanal } from "@/db/schema";
import { assurerCanalGeneral, canalAccessible, canauxAccessibles, chargerAutour, chargerMessages, reactionsDe, rechercherMessages } from "@/lib/messagerie/acces";
import type { UtilisateurConnecte } from "@/lib/session";

/**
 * One Chat : groupes privés, réactions, fils de discussion et recherche. Contrôles de fuite (un groupe privé reste
 * privé, même à l'Administrateur ; la recherche ne sort jamais du périmètre visible) et de logique.
 */
describe("One Chat — groupes privés, réactions, fils, recherche", () => {
  let kiroId: string;
  let mbargaId: string;
  let alice: UtilisateurConnecte; // crée le groupe
  let bob: UtilisateurConnecte; // membre du groupe
  let carl: UtilisateurConnecte; // ADMINISTRATEUR de l'entreprise, mais pas membre du groupe
  let mbargaAdmin: UtilisateurConnecte;
  let generalId: string;
  let groupeId: string;
  let canalMbargaId: string;
  const suffixe = Math.random().toString(36).slice(2, 8);
  const ilYa = (minutes: number) => new Date(Date.now() - minutes * 60_000);

  beforeAll(async () => {
    const [kiro] = await db.insert(entreprise).values({ nom: "TEST Chat Groupes Kiro", secteurProfil: "agence" }).returning({ id: entreprise.id });
    const [mbarga] = await db.insert(entreprise).values({ nom: "TEST Chat Groupes Mbarga", secteurProfil: "artisan" }).returning({ id: entreprise.id });
    kiroId = kiro.id;
    mbargaId = mbarga.id;
    const creer = async (entrepriseId: string, email: string, nomComplet: string, role: "ADMIN" | "EMPLOYE") => {
      const [u] = await db.insert(utilisateur).values({ entrepriseId, email, nomComplet, role }).returning({ id: utilisateur.id });
      return { utilisateurId: u.id, entrepriseId, role } as UtilisateurConnecte;
    };
    alice = await creer(kiroId, `alice-grp-${suffixe}@vertexone.test`, "Alice", "EMPLOYE");
    bob = await creer(kiroId, `bob-grp-${suffixe}@vertexone.test`, "Bob", "EMPLOYE");
    carl = await creer(kiroId, `carl-grp-${suffixe}@vertexone.test`, "Carl Admin", "ADMIN");
    mbargaAdmin = await creer(mbargaId, `admin-grp-mbarga-${suffixe}@vertexone.test`, "Admin Mbarga", "ADMIN");

    await avecEntreprise(kiroId, async (tx) => {
      await assurerCanalGeneral(tx, kiroId);
      const [general] = await tx.select().from(canal).where(eq(canal.idFournisseurChat, `${kiroId}__general`));
      generalId = general.id;
      const [g] = await tx.insert(canal).values({ entrepriseId: kiroId, nom: "Confidentiel RH", type: "PRIVE", creeParId: alice.utilisateurId, idFournisseurChat: `${kiroId}__groupe-${suffixe}` }).returning({ id: canal.id });
      groupeId = g.id;
      await tx.insert(membreCanal).values([alice, bob].map((u) => ({ entrepriseId: kiroId, canalId: g.id, utilisateurId: u.utilisateurId })));
      await tx.insert(messageCanal).values({ entrepriseId: kiroId, canalId: g.id, auteurId: alice.utilisateurId, contenu: "Le budget secretissime du groupe" });
    });
    await avecEntreprise(mbargaId, async (tx) => {
      await assurerCanalGeneral(tx, mbargaId);
      const [general] = await tx.select().from(canal).where(eq(canal.idFournisseurChat, `${mbargaId}__general`));
      canalMbargaId = general.id;
      await tx.insert(messageCanal).values({ entrepriseId: mbargaId, canalId: canalMbargaId, auteurId: mbargaAdmin.utilisateurId, contenu: "Le budget secretissime de Mbarga" });
    });
  }, 90_000);

  afterAll(async () => {
    for (const id of [kiroId, mbargaId]) {
      await avecEntreprise(id, async (tx) => {
        await tx.delete(reactionMessage).where(eq(reactionMessage.entrepriseId, id));
        await tx.delete(mentionMessage).where(eq(mentionMessage.entrepriseId, id));
        await tx.delete(lectureCanal).where(eq(lectureCanal.entrepriseId, id));
        // Les réponses de fil référencent leur message d'origine : d'abord les réponses, puis le reste.
        const reponses = await tx.select({ id: messageCanal.id, parentId: messageCanal.parentId }).from(messageCanal).where(eq(messageCanal.entrepriseId, id));
        const idsReponses = reponses.filter((m) => m.parentId).map((m) => m.id);
        if (idsReponses.length) await tx.delete(messageCanal).where(inArray(messageCanal.id, idsReponses));
        await tx.delete(messageCanal).where(eq(messageCanal.entrepriseId, id));
        await tx.delete(membreCanal).where(eq(membreCanal.entrepriseId, id));
        await tx.delete(canal).where(eq(canal.entrepriseId, id));
      });
      await db.delete(utilisateur).where(eq(utilisateur.entrepriseId, id));
      await db.delete(entreprise).where(eq(entreprise.id, id));
    }
  }, 90_000);

  // ----- Groupes privés -----

  test("un groupe privé n'est visible que de ses membres — pas même de l'Administrateur", async () => {
    for (const membre of [alice, bob]) {
      expect(await avecEntreprise(kiroId, (tx) => canalAccessible(tx, membre, groupeId))).not.toBeNull();
      expect((await avecEntreprise(kiroId, (tx) => canauxAccessibles(tx, membre))).some((c) => c.id === groupeId)).toBe(true);
    }
    // Carl est ADMIN de l'entreprise : le groupe reste hors de sa vue.
    expect(await avecEntreprise(kiroId, (tx) => canalAccessible(tx, carl, groupeId))).toBeNull();
    expect((await avecEntreprise(kiroId, (tx) => canauxAccessibles(tx, carl))).some((c) => c.id === groupeId)).toBe(false);
    // Une autre entreprise non plus, même en connaissant l'identifiant.
    expect(await avecEntreprise(mbargaId, (tx) => canalAccessible(tx, mbargaAdmin, groupeId))).toBeNull();
  }, 90_000);

  test("retirer un membre lui retire aussitôt l'accès au groupe", async () => {
    await avecEntreprise(kiroId, (tx) => tx.delete(membreCanal).where(eq(membreCanal.utilisateurId, bob.utilisateurId)));
    expect(await avecEntreprise(kiroId, (tx) => canalAccessible(tx, bob, groupeId))).toBeNull();
    expect(await avecEntreprise(kiroId, (tx) => canalAccessible(tx, alice, groupeId))).not.toBeNull();
    // On le remet pour la suite.
    await avecEntreprise(kiroId, (tx) => tx.insert(membreCanal).values({ entrepriseId: kiroId, canalId: groupeId, utilisateurId: bob.utilisateurId }));
    expect(await avecEntreprise(kiroId, (tx) => canalAccessible(tx, bob, groupeId))).not.toBeNull();
  }, 90_000);

  test("les tables de réactions et de mentions sont cloisonnées par entreprise", async () => {
    const [message] = await avecEntreprise(kiroId, (tx) => tx.select({ id: messageCanal.id }).from(messageCanal).where(eq(messageCanal.canalId, groupeId)));
    await avecEntreprise(kiroId, (tx) => tx.insert(reactionMessage).values({ entrepriseId: kiroId, messageId: message.id, utilisateurId: alice.utilisateurId, emoji: "👍" }));
    await avecEntreprise(kiroId, (tx) => tx.insert(mentionMessage).values({ entrepriseId: kiroId, messageId: message.id, utilisateurId: bob.utilisateurId }));

    expect(await avecEntreprise(mbargaId, (tx) => tx.select().from(reactionMessage))).toHaveLength(0);
    expect(await avecEntreprise(mbargaId, (tx) => tx.select().from(mentionMessage))).toHaveLength(0);
    expect(await db.select().from(reactionMessage)).toHaveLength(0); // sans session : rien
    await expect(
      avecEntreprise(mbargaId, (tx) => tx.insert(reactionMessage).values({ entrepriseId: kiroId, messageId: message.id, utilisateurId: mbargaAdmin.utilisateurId, emoji: "❤️" }))
    ).rejects.toThrow();
  }, 90_000);

  // ----- Réactions -----

  test("réactions : regroupées par emoji avec le total et « ai-je réagi ? », une seule fois par personne et par emoji", async () => {
    const [message] = await avecEntreprise(kiroId, (tx) =>
      tx.insert(messageCanal).values({ entrepriseId: kiroId, canalId: generalId, auteurId: alice.utilisateurId, contenu: "On fête ça ?" }).returning({ id: messageCanal.id })
    );
    const reagir = (u: UtilisateurConnecte, emoji: string) => avecEntreprise(kiroId, (tx) => tx.insert(reactionMessage).values({ entrepriseId: kiroId, messageId: message.id, utilisateurId: u.utilisateurId, emoji }));
    await reagir(alice, "🎉");
    await reagir(bob, "🎉");
    await reagir(bob, "👍");

    const vueParAlice = (await avecEntreprise(kiroId, (tx) => reactionsDe(tx, [message.id], alice.utilisateurId))).get(message.id)!;
    expect(vueParAlice).toEqual([
      { emoji: "🎉", total: 2, moi: true },
      { emoji: "👍", total: 1, moi: false },
    ]);
    const vueParBob = (await avecEntreprise(kiroId, (tx) => reactionsDe(tx, [message.id], bob.utilisateurId))).get(message.id)!;
    expect(vueParBob.find((r) => r.emoji === "👍")!.moi).toBe(true);

    // Réagir deux fois avec le même emoji est refusé par la base (unicité).
    await expect(reagir(bob, "🎉")).rejects.toThrow();
  }, 90_000);

  test("un message supprimé ne renvoie plus ses réactions", async () => {
    const [message] = await avecEntreprise(kiroId, (tx) =>
      tx.insert(messageCanal).values({ entrepriseId: kiroId, canalId: generalId, auteurId: alice.utilisateurId, contenu: "à supprimer" }).returning({ id: messageCanal.id })
    );
    await avecEntreprise(kiroId, (tx) => tx.insert(reactionMessage).values({ entrepriseId: kiroId, messageId: message.id, utilisateurId: bob.utilisateurId, emoji: "🙏" }));
    await avecEntreprise(kiroId, (tx) => tx.update(messageCanal).set({ contenu: "", supprimeLe: new Date(), misAJourLe: new Date() }).where(eq(messageCanal.id, message.id)));
    const liste = await avecEntreprise(kiroId, (tx) => chargerMessages(tx, generalId, alice.utilisateurId, { limite: 200 }));
    const supprime = liste.find((m) => m.id === message.id)!;
    expect(supprime.supprime).toBe(true);
    expect(supprime.reactions).toEqual([]);
  }, 90_000);

  // ----- Fils de discussion -----

  test("fils : les réponses n'apparaissent pas dans la chronologie, le nombre de réponses ignore les supprimées, le fil les regroupe", async () => {
    const [racine] = await avecEntreprise(kiroId, (tx) =>
      tx.insert(messageCanal).values({ entrepriseId: kiroId, canalId: generalId, auteurId: alice.utilisateurId, contenu: "Question de fond", creeLe: ilYa(30) }).returning({ id: messageCanal.id })
    );
    const [r1, r2, r3] = await avecEntreprise(kiroId, (tx) =>
      tx
        .insert(messageCanal)
        .values([
          { entrepriseId: kiroId, canalId: generalId, auteurId: bob.utilisateurId, contenu: "Réponse un", parentId: racine.id, creeLe: ilYa(29) },
          { entrepriseId: kiroId, canalId: generalId, auteurId: alice.utilisateurId, contenu: "Réponse deux", parentId: racine.id, creeLe: ilYa(28) },
          { entrepriseId: kiroId, canalId: generalId, auteurId: bob.utilisateurId, contenu: "", supprimeLe: new Date(), parentId: racine.id, creeLe: ilYa(27) },
        ])
        .returning({ id: messageCanal.id })
    );
    void r1;
    void r2;
    void r3;

    const chronologie = await avecEntreprise(kiroId, (tx) => chargerMessages(tx, generalId, alice.utilisateurId, { limite: 200 }));
    expect(chronologie.some((m) => m.contenu === "Réponse un" || m.contenu === "Réponse deux")).toBe(false);
    const lRacine = chronologie.find((m) => m.id === racine.id)!;
    expect(lRacine.nbReponses).toBe(2); // la réponse supprimée ne compte pas
    expect(lRacine.parentId).toBeNull();

    const fil = await avecEntreprise(kiroId, (tx) => chargerMessages(tx, generalId, alice.utilisateurId, { fil: racine.id, limite: 200 }));
    expect(fil.map((m) => m.contenu)).toEqual(["Question de fond", "Réponse un", "Réponse deux", null]);
    expect(fil.slice(1).every((m) => m.parentId === racine.id)).toBe(true);
  }, 90_000);

  test("fils : un message d'un autre canal ne peut pas être lu en passant son identifiant comme « fil »", async () => {
    // Le fil demandé pour un message du groupe privé, mais dans le canal Général : rien ne doit sortir.
    const [dansGroupe] = await avecEntreprise(kiroId, (tx) => tx.select({ id: messageCanal.id }).from(messageCanal).where(eq(messageCanal.canalId, groupeId)));
    const fuite = await avecEntreprise(kiroId, (tx) => chargerMessages(tx, generalId, alice.utilisateurId, { fil: dansGroupe.id }));
    expect(fuite).toHaveLength(0);
  }, 90_000);

  test("fils : une réponse fait remonter son message d'origine dans la lecture incrémentale", async () => {
    const chronologie = await avecEntreprise(kiroId, (tx) => chargerMessages(tx, generalId, alice.utilisateurId, { limite: 200 }));
    // Point de départ = le changement le plus récent de tout le canal (pas le dernier message par date de création).
    const depuis = new Date(Math.max(...chronologie.map((m) => new Date(m.misAJourLe).getTime())) + 1);
    expect(await avecEntreprise(kiroId, (tx) => chargerMessages(tx, generalId, alice.utilisateurId, { apres: depuis }))).toHaveLength(0);

    const [racine] = chronologie.filter((m) => m.contenu === "Question de fond");
    await avecEntreprise(kiroId, async (tx) => {
      await tx.insert(messageCanal).values({ entrepriseId: kiroId, canalId: generalId, auteurId: bob.utilisateurId, contenu: "Réponse trois", parentId: racine.id });
      await tx.update(messageCanal).set({ misAJourLe: new Date(depuis.getTime() + 5000) }).where(eq(messageCanal.id, racine.id)); // ce que fait l'action envoyerMessage
    });
    const nouveaux = await avecEntreprise(kiroId, (tx) => chargerMessages(tx, generalId, alice.utilisateurId, { apres: depuis }));
    expect(nouveaux).toHaveLength(1);
    expect(nouveaux[0].id).toBe(racine.id);
    expect(nouveaux[0].nbReponses).toBe(3);
  }, 90_000);

  // ----- Recherche -----

  test("recherche : trouve le texte sans tenir compte de la casse, dans les canaux visibles seulement", async () => {
    const pourBob = await avecEntreprise(kiroId, (tx) => rechercherMessages(tx, bob, "SECRETISSIME"));
    expect(pourBob.map((r) => r.canalId)).toEqual([groupeId]); // Bob est membre du groupe, pas de l'autre entreprise

    // Carl est Administrateur mais pas membre du groupe : il ne trouve rien.
    expect(await avecEntreprise(kiroId, (tx) => rechercherMessages(tx, carl, "secretissime"))).toHaveLength(0);
    // Mbarga trouve SON message, jamais celui de Kiro.
    const pourMbarga = await avecEntreprise(mbargaId, (tx) => rechercherMessages(tx, mbargaAdmin, "secretissime"));
    expect(pourMbarga.map((r) => r.canalId)).toEqual([canalMbargaId]);
    expect(pourMbarga[0].extrait).toContain("Mbarga");
  }, 90_000);

  test("recherche : trop courte = rien, jokers SQL neutralisés, messages supprimés et noms de pièces jointes gérés", async () => {
    expect(await avecEntreprise(kiroId, (tx) => rechercherMessages(tx, alice, "a"))).toEqual([]);
    expect(await avecEntreprise(kiroId, (tx) => rechercherMessages(tx, alice, "  "))).toEqual([]);

    await avecEntreprise(kiroId, (tx) =>
      tx.insert(messageCanal).values([
        { entrepriseId: kiroId, canalId: generalId, auteurId: alice.utilisateurId, contenu: "Remise de 100% sur tout" },
        { entrepriseId: kiroId, canalId: generalId, auteurId: alice.utilisateurId, contenu: "Remise de 1000 unités" },
        { entrepriseId: kiroId, canalId: generalId, auteurId: alice.utilisateurId, contenu: "", pieceJointeCle: "c/f.pdf", pieceJointeNom: "contrat-zircon.pdf", pieceJointeType: "application/pdf", pieceJointeTaille: 10 },
        { entrepriseId: kiroId, canalId: generalId, auteurId: alice.utilisateurId, contenu: "", supprimeLe: new Date(), pieceJointeNom: null },
      ])
    );
    // « 100% » ne doit correspondre qu'à la chaîne littérale, pas à « 1000 » (le % n'est pas un joker).
    const litteral = await avecEntreprise(kiroId, (tx) => rechercherMessages(tx, alice, "100%"));
    expect(litteral.map((r) => r.extrait)).toEqual([expect.stringContaining("100% sur tout")]);
    const souligne = await avecEntreprise(kiroId, (tx) => rechercherMessages(tx, alice, "1_0"));
    expect(souligne).toHaveLength(0); // le _ n'est pas un joker non plus
    // Nom de pièce jointe.
    const piece = await avecEntreprise(kiroId, (tx) => rechercherMessages(tx, alice, "zircon"));
    expect(piece).toHaveLength(1);
    expect(piece[0].extrait).toBe("Pièce jointe : contrat-zircon.pdf");
  }, 90_000);

  test("chargerAutour : fenêtre centrée sur le message, et une réponse de fil ramène à son message d'origine", async () => {
    const [racine] = (await avecEntreprise(kiroId, (tx) => chargerMessages(tx, generalId, alice.utilisateurId, { limite: 200 }))).filter((m) => m.contenu === "Question de fond");
    const direct = await avecEntreprise(kiroId, (tx) => chargerAutour(tx, generalId, racine.id, alice.utilisateurId));
    expect(direct!.racineId).toBe(racine.id);
    expect(direct!.messages.some((m) => m.id === racine.id)).toBe(true);
    expect(direct!.messages.every((m) => m.parentId === null)).toBe(true); // la chronologie, jamais les réponses

    const [reponse] = await avecEntreprise(kiroId, (tx) => tx.select({ id: messageCanal.id }).from(messageCanal).where(eq(messageCanal.contenu, "Réponse un")));
    const viaReponse = await avecEntreprise(kiroId, (tx) => chargerAutour(tx, generalId, reponse.id, alice.utilisateurId));
    expect(viaReponse!.racineId).toBe(racine.id);

    // Un message d'un autre canal n'est jamais retrouvé par ce canal.
    const [dansGroupe] = await avecEntreprise(kiroId, (tx) => tx.select({ id: messageCanal.id }).from(messageCanal).where(eq(messageCanal.canalId, groupeId)));
    expect(await avecEntreprise(kiroId, (tx) => chargerAutour(tx, generalId, dansGroupe.id, alice.utilisateurId))).toBeNull();
  }, 90_000);
});
