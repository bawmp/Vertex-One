import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, utilisateur, contact, dossier, projet, canal, messageCanal, lectureCanal, membreCanal } from "@/db/schema";
import { assurerCanalGeneral, canalAccessible, canauxAccessibles, chargerMessages, compterNonLus, enregistrerActivite, listerCollegues, marquerCanalLu, ouvrirConversationDirecte } from "@/lib/messagerie/acces";
import type { UtilisateurConnecte } from "@/lib/session";

/**
 * Messagerie intégrée : isolation entre entreprises (fuite délibérée) et logique — visibilité des canaux de
 * projet selon la portée, non-lus, suppression qui efface le texte sans casser le fil.
 */
describe("One Chat — isolation RLS et logique", () => {
  let kiroId: string;
  let mbargaId: string;
  let adminKiro: UtilisateurConnecte;
  let employeKiro: UtilisateurConnecte;
  let adminMbarga: UtilisateurConnecte;
  let troisiemeKiro: UtilisateurConnecte;
  let clientKiro: UtilisateurConnecte;
  let canalGeneralKiroId: string;
  let canalProjetKiroId: string;
  let canalMbargaId: string;
  const suffixe = Math.random().toString(36).slice(2, 8);

  beforeAll(async () => {
    const [kiro] = await db.insert(entreprise).values({ nom: "TEST Chat Agence Kiro", secteurProfil: "agence" }).returning({ id: entreprise.id });
    const [mbarga] = await db.insert(entreprise).values({ nom: "TEST Chat Garage Mbarga", secteurProfil: "artisan" }).returning({ id: entreprise.id });
    kiroId = kiro.id;
    mbargaId = mbarga.id;

    const creer = async (entrepriseId: string, email: string, nomComplet: string, role: "ADMIN" | "EMPLOYE" | "CLIENT") => {
      const [u] = await db.insert(utilisateur).values({ entrepriseId, email, nomComplet, role }).returning({ id: utilisateur.id });
      return { utilisateurId: u.id, entrepriseId, role } as UtilisateurConnecte;
    };
    adminKiro = await creer(kiroId, `admin-chat-kiro-${suffixe}@vertexone.test`, "Admin Kiro", "ADMIN");
    employeKiro = await creer(kiroId, `employe-chat-kiro-${suffixe}@vertexone.test`, "Employé Kiro", "EMPLOYE");
    troisiemeKiro = await creer(kiroId, `troisieme-chat-kiro-${suffixe}@vertexone.test`, "Troisième Kiro", "EMPLOYE");
    clientKiro = await creer(kiroId, `client-chat-kiro-${suffixe}@vertexone.test`, "Client Portail Kiro", "CLIENT");
    adminMbarga = await creer(mbargaId, `admin-chat-mbarga-${suffixe}@vertexone.test`, "Admin Mbarga", "ADMIN");

    await avecEntreprise(kiroId, async (tx) => {
      await assurerCanalGeneral(tx, kiroId);
      const [c] = await tx.insert(contact).values({ entrepriseId: kiroId, nom: "Client Kiro", telephone: "690000001", assigneAId: adminKiro.utilisateurId }).returning({ id: contact.id });
      const [d] = await tx.insert(dossier).values({ entrepriseId: kiroId, contactId: c.id, titre: "Dossier Kiro", responsableId: adminKiro.utilisateurId }).returning({ id: dossier.id });
      // Projet dont le responsable est l'ADMIN : l'Employé (portée « propre ») ne doit pas voir son canal.
      const [p] = await tx.insert(projet).values({ entrepriseId: kiroId, dossierId: d.id, titre: "Projet secret Kiro", responsablePrincipalId: adminKiro.utilisateurId }).returning({ id: projet.id });
      const [cp] = await tx.insert(canal).values({ entrepriseId: kiroId, nom: "Projet secret Kiro", type: "PROJET", projetId: p.id, idFournisseurChat: `${kiroId}__${p.id}` }).returning({ id: canal.id });
      canalProjetKiroId = cp.id;
      const [general] = await tx.select().from(canal).where(eq(canal.idFournisseurChat, `${kiroId}__general`));
      canalGeneralKiroId = general.id;
    });
    await avecEntreprise(mbargaId, async (tx) => {
      await assurerCanalGeneral(tx, mbargaId);
      const [general] = await tx.select().from(canal).where(eq(canal.idFournisseurChat, `${mbargaId}__general`));
      canalMbargaId = general.id;
      await tx.insert(messageCanal).values({ entrepriseId: mbargaId, canalId: canalMbargaId, auteurId: adminMbarga.utilisateurId, contenu: "Message confidentiel Mbarga" });
    });
  }, 90_000);

  afterAll(async () => {
    for (const id of [kiroId, mbargaId]) {
      await avecEntreprise(id, async (tx) => {
        await tx.delete(lectureCanal).where(eq(lectureCanal.entrepriseId, id));
        await tx.delete(messageCanal).where(eq(messageCanal.entrepriseId, id));
        await tx.delete(membreCanal).where(eq(membreCanal.entrepriseId, id));
        await tx.delete(canal).where(eq(canal.entrepriseId, id));
        await tx.delete(projet).where(eq(projet.entrepriseId, id));
        await tx.delete(dossier).where(eq(dossier.entrepriseId, id));
        await tx.delete(contact).where(eq(contact.entrepriseId, id));
      });
      await db.delete(utilisateur).where(eq(utilisateur.entrepriseId, id));
      await db.delete(entreprise).where(eq(entreprise.id, id));
    }
  }, 90_000);

  test("assurerCanalGeneral est idempotent : un seul canal Général par entreprise", async () => {
    await avecEntreprise(kiroId, (tx) => assurerCanalGeneral(tx, kiroId));
    const generaux = await avecEntreprise(kiroId, (tx) => tx.select().from(canal).where(eq(canal.idFournisseurChat, `${kiroId}__general`)));
    expect(generaux).toHaveLength(1);
  });

  test("une autre entreprise ne voit ni le canal ni les messages de Mbarga", async () => {
    const canauxVus = await avecEntreprise(kiroId, (tx) => canauxAccessibles(tx, adminKiro));
    expect(canauxVus.some((c) => c.id === canalMbargaId)).toBe(false);

    const messagesVus = await avecEntreprise(kiroId, (tx) => tx.select().from(messageCanal).where(eq(messageCanal.canalId, canalMbargaId)));
    expect(messagesVus).toHaveLength(0);

    // Même en connaissant l'identifiant du canal, l'accès est refusé (et le chargement ne renvoie rien).
    expect(await avecEntreprise(kiroId, (tx) => canalAccessible(tx, adminKiro, canalMbargaId))).toBeNull();
    expect(await avecEntreprise(kiroId, (tx) => chargerMessages(tx, canalMbargaId, adminKiro.utilisateurId))).toHaveLength(0);
  });

  test("une autre entreprise ne peut pas écrire dans le canal de Mbarga", async () => {
    await expect(
      avecEntreprise(kiroId, (tx) => tx.insert(messageCanal).values({ entrepriseId: mbargaId, canalId: canalMbargaId, auteurId: adminKiro.utilisateurId, contenu: "intrus" }))
    ).rejects.toThrow();
    const modifies = await avecEntreprise(kiroId, (tx) => tx.update(messageCanal).set({ contenu: "piraté" }).where(eq(messageCanal.canalId, canalMbargaId)).returning());
    expect(modifies).toHaveLength(0);
  });

  test("sans session, aucune lecture de message n'est possible", async () => {
    const anonyme = await db.select().from(messageCanal).where(eq(messageCanal.canalId, canalMbargaId));
    expect(anonyme).toHaveLength(0);
  });

  test("un canal de projet reste invisible à qui n'a pas accès au projet, même en connaissant son identifiant", async () => {
    const vusAdmin = await avecEntreprise(kiroId, (tx) => canauxAccessibles(tx, adminKiro));
    expect(vusAdmin.some((c) => c.id === canalProjetKiroId)).toBe(true);

    const vusEmploye = await avecEntreprise(kiroId, (tx) => canauxAccessibles(tx, employeKiro));
    expect(vusEmploye.some((c) => c.id === canalProjetKiroId)).toBe(false);
    expect(vusEmploye.some((c) => c.id === canalGeneralKiroId)).toBe(true);
    expect(await avecEntreprise(kiroId, (tx) => canalAccessible(tx, employeKiro, canalProjetKiroId))).toBeNull();
  });

  test("non-lus : comptés pour les autres, remis à zéro à la lecture, jamais pour l'auteur", async () => {
    await avecEntreprise(kiroId, async (tx) => {
      await tx.insert(messageCanal).values([
        { entrepriseId: kiroId, canalId: canalGeneralKiroId, auteurId: adminKiro.utilisateurId, contenu: "Bonjour l'équipe" },
        { entrepriseId: kiroId, canalId: canalGeneralKiroId, auteurId: adminKiro.utilisateurId, contenu: "Réunion à 10h" },
      ]);
    });

    const pourEmploye = await avecEntreprise(kiroId, (tx) => compterNonLus(tx, employeKiro, [canalGeneralKiroId]));
    expect(pourEmploye[canalGeneralKiroId]).toBe(2);
    const pourAuteur = await avecEntreprise(kiroId, (tx) => compterNonLus(tx, adminKiro, [canalGeneralKiroId]));
    expect(pourAuteur[canalGeneralKiroId] ?? 0).toBe(0);

    await avecEntreprise(kiroId, (tx) => marquerCanalLu(tx, kiroId, canalGeneralKiroId, employeKiro.utilisateurId));
    const apres = await avecEntreprise(kiroId, (tx) => compterNonLus(tx, employeKiro, [canalGeneralKiroId]));
    expect(apres[canalGeneralKiroId] ?? 0).toBe(0);
  });

  test("non-lus par canal : lire « Général » ne remet pas à zéro un autre canal jamais ouvert", async () => {
    const autreCanalId = await avecEntreprise(kiroId, async (tx) => {
      const [c] = await tx.insert(canal).values({ entrepriseId: kiroId, nom: "Idées", type: "LIBRE", idFournisseurChat: `${kiroId}__idees-${suffixe}` }).returning({ id: canal.id });
      await tx.insert(messageCanal).values({ entrepriseId: kiroId, canalId: c.id, auteurId: adminKiro.utilisateurId, contenu: "Une idée" });
      return c.id;
    });
    // L'employé a déjà une ligne de lecture pour « Général » (la page la crée à l'ouverture)…
    await avecEntreprise(kiroId, (tx) => marquerCanalLu(tx, kiroId, canalGeneralKiroId, employeKiro.utilisateurId));
    // … mais aucune pour « Idées » : le message d'Alice doit compter.
    const nl = await avecEntreprise(kiroId, (tx) => compterNonLus(tx, employeKiro, [canalGeneralKiroId, autreCanalId]));
    expect(nl[autreCanalId]).toBe(1);
    expect(nl[canalGeneralKiroId] ?? 0).toBe(0);
  }, 60_000);

  test("un message supprimé ne renvoie jamais son texte, mais garde sa place dans le fil et ne compte plus comme non lu", async () => {
    const [message] = await avecEntreprise(kiroId, (tx) =>
      tx.insert(messageCanal).values({ entrepriseId: kiroId, canalId: canalGeneralKiroId, auteurId: adminKiro.utilisateurId, contenu: "Mot de passe wifi : secret123" }).returning({ id: messageCanal.id })
    );
    expect((await avecEntreprise(kiroId, (tx) => compterNonLus(tx, employeKiro, [canalGeneralKiroId])))[canalGeneralKiroId]).toBe(1);

    await avecEntreprise(kiroId, (tx) => tx.update(messageCanal).set({ contenu: "", supprimeLe: new Date(), misAJourLe: new Date(Date.now() + 1000) }).where(eq(messageCanal.id, message.id)));

    const liste = await avecEntreprise(kiroId, (tx) => chargerMessages(tx, canalGeneralKiroId, adminKiro.utilisateurId));
    const supprime = liste.find((m) => m.id === message.id)!;
    expect(supprime.supprime).toBe(true);
    expect(supprime.contenu).toBeNull();
    expect(JSON.stringify(liste)).not.toContain("secret123");
    expect((await avecEntreprise(kiroId, (tx) => compterNonLus(tx, employeKiro, [canalGeneralKiroId])))[canalGeneralKiroId] ?? 0).toBe(0);
  });

  test("mise à jour incrémentale : « après » ne renvoie que ce qui a changé, y compris une suppression", async () => {
    const tous = await avecEntreprise(kiroId, (tx) => chargerMessages(tx, canalGeneralKiroId, adminKiro.utilisateurId));
    const dernier = tous[tous.length - 1];
    const depuis = new Date(new Date(dernier.misAJourLe).getTime() + 1);

    expect(await avecEntreprise(kiroId, (tx) => chargerMessages(tx, canalGeneralKiroId, adminKiro.utilisateurId, { apres: depuis }))).toHaveLength(0);

    await avecEntreprise(kiroId, (tx) => tx.insert(messageCanal).values({ entrepriseId: kiroId, canalId: canalGeneralKiroId, auteurId: employeKiro.utilisateurId, contenu: "Bien reçu", misAJourLe: new Date(depuis.getTime() + 5000) }));
    const nouveaux = await avecEntreprise(kiroId, (tx) => chargerMessages(tx, canalGeneralKiroId, adminKiro.utilisateurId, { apres: depuis }));
    expect(nouveaux.map((m) => m.contenu)).toEqual(["Bien reçu"]);
  });

  // ----- Messages directs -----

  test("message direct : idempotent (une seule conversation par paire), privé à ses deux participants", async () => {
    const id1 = await avecEntreprise(kiroId, (tx) => ouvrirConversationDirecte(tx, adminKiro, employeKiro.utilisateurId));
    const id2 = await avecEntreprise(kiroId, (tx) => ouvrirConversationDirecte(tx, employeKiro, adminKiro.utilisateurId)); // dans l'autre sens
    const id3 = await avecEntreprise(kiroId, (tx) => ouvrirConversationDirecte(tx, adminKiro, employeKiro.utilisateurId)); // répété
    expect(id1).toBeTruthy();
    expect(id2).toBe(id1);
    expect(id3).toBe(id1);
    const membres = await avecEntreprise(kiroId, (tx) => tx.select().from(membreCanal).where(eq(membreCanal.canalId, id1!)));
    expect(membres.map((m) => m.utilisateurId).sort()).toEqual([adminKiro.utilisateurId, employeKiro.utilisateurId].sort());

    await avecEntreprise(kiroId, (tx) => tx.insert(messageCanal).values({ entrepriseId: kiroId, canalId: id1!, auteurId: adminKiro.utilisateurId, contenu: "Message très privé" }));

    // Les deux participants le voient ; un troisième collègue, même Administrateur d'une autre entreprise ou non, jamais.
    expect(await avecEntreprise(kiroId, (tx) => canalAccessible(tx, adminKiro, id1!))).not.toBeNull();
    expect(await avecEntreprise(kiroId, (tx) => canalAccessible(tx, employeKiro, id1!))).not.toBeNull();
    expect(await avecEntreprise(kiroId, (tx) => canalAccessible(tx, troisiemeKiro, id1!))).toBeNull();
    const vusTroisieme = await avecEntreprise(kiroId, (tx) => canauxAccessibles(tx, troisiemeKiro));
    expect(vusTroisieme.some((c) => c.id === id1)).toBe(false);
    const vusEmploye = await avecEntreprise(kiroId, (tx) => canauxAccessibles(tx, employeKiro));
    expect(vusEmploye.some((c) => c.id === id1)).toBe(true);
  }, 90_000);

  test("message direct : refusé vers soi-même, vers un client du portail, ou vers une autre entreprise", async () => {
    expect(await avecEntreprise(kiroId, (tx) => ouvrirConversationDirecte(tx, adminKiro, adminKiro.utilisateurId))).toBeNull();
    expect(await avecEntreprise(kiroId, (tx) => ouvrirConversationDirecte(tx, adminKiro, clientKiro.utilisateurId))).toBeNull();
    expect(await avecEntreprise(kiroId, (tx) => ouvrirConversationDirecte(tx, adminKiro, adminMbarga.utilisateurId))).toBeNull();
    expect(await avecEntreprise(kiroId, (tx) => ouvrirConversationDirecte(tx, adminKiro, "id-inexistant"))).toBeNull();
  }, 90_000);

  test("les collègues proposés excluent soi-même et les clients du portail", async () => {
    const liste = await avecEntreprise(kiroId, (tx) => listerCollegues(tx, adminKiro));
    const ids = liste.map((c) => c.id);
    expect(ids).toContain(employeKiro.utilisateurId);
    expect(ids).toContain(troisiemeKiro.utilisateurId);
    expect(ids).not.toContain(adminKiro.utilisateurId);
    expect(ids).not.toContain(clientKiro.utilisateurId);
    expect(ids).not.toContain(adminMbarga.utilisateurId);
  }, 90_000);

  // ----- Présence en ligne -----

  test("présence : « en ligne » seulement après un signe de vie récent, et jamais sans", async () => {
    const avant = await avecEntreprise(kiroId, (tx) => listerCollegues(tx, adminKiro));
    expect(avant.find((c) => c.id === employeKiro.utilisateurId)!.enLigne).toBe(false);

    await avecEntreprise(kiroId, (tx) => enregistrerActivite(tx, employeKiro));
    const apres = await avecEntreprise(kiroId, (tx) => listerCollegues(tx, adminKiro));
    expect(apres.find((c) => c.id === employeKiro.utilisateurId)!.enLigne).toBe(true);
    expect(apres.find((c) => c.id === troisiemeKiro.utilisateurId)!.enLigne).toBe(false);

    // Une activité ancienne (il y a 10 minutes) ne compte plus.
    await db.update(utilisateur).set({ derniereActiviteLe: new Date(Date.now() - 10 * 60_000) }).where(eq(utilisateur.id, employeKiro.utilisateurId));
    const ancien = await avecEntreprise(kiroId, (tx) => listerCollegues(tx, adminKiro));
    expect(ancien.find((c) => c.id === employeKiro.utilisateurId)!.enLigne).toBe(false);
  }, 90_000);

  // ----- Pièces jointes -----

  test("pièce jointe : renvoyée avec son type d'image, jamais sur un message supprimé", async () => {
    const [avecImage] = await avecEntreprise(kiroId, (tx) =>
      tx
        .insert(messageCanal)
        .values({ entrepriseId: kiroId, canalId: canalGeneralKiroId, auteurId: adminKiro.utilisateurId, contenu: "", pieceJointeCle: "cle/x.png", pieceJointeNom: "plan.png", pieceJointeType: "image/png", pieceJointeTaille: 2048 })
        .returning({ id: messageCanal.id })
    );
    const [avecPdf] = await avecEntreprise(kiroId, (tx) =>
      tx
        .insert(messageCanal)
        .values({ entrepriseId: kiroId, canalId: canalGeneralKiroId, auteurId: adminKiro.utilisateurId, contenu: "Le devis", pieceJointeCle: "cle/y.pdf", pieceJointeNom: "devis.pdf", pieceJointeType: "application/pdf", pieceJointeTaille: 4096 })
        .returning({ id: messageCanal.id })
    );

    const liste = await avecEntreprise(kiroId, (tx) => chargerMessages(tx, canalGeneralKiroId, adminKiro.utilisateurId, { limite: 200 }));
    expect(liste.find((m) => m.id === avecImage.id)!.piece).toEqual({ nom: "plan.png", type: "image/png", taille: 2048, image: true });
    expect(liste.find((m) => m.id === avecPdf.id)!.piece).toEqual({ nom: "devis.pdf", type: "application/pdf", taille: 4096, image: false });
    // La clé de stockage n'est jamais renvoyée au navigateur.
    expect(JSON.stringify(liste)).not.toContain("cle/x.png");

    await avecEntreprise(kiroId, (tx) => tx.update(messageCanal).set({ contenu: "", supprimeLe: new Date(), misAJourLe: new Date(), pieceJointeCle: null, pieceJointeNom: null, pieceJointeType: null, pieceJointeTaille: null }).where(eq(messageCanal.id, avecPdf.id)));
    const apres = await avecEntreprise(kiroId, (tx) => chargerMessages(tx, canalGeneralKiroId, adminKiro.utilisateurId, { limite: 200 }));
    expect(apres.find((m) => m.id === avecPdf.id)!.piece).toBeNull();
    expect(apres.find((m) => m.id === avecPdf.id)!.supprime).toBe(true);
  }, 90_000);

  test("un message direct est cloisonné par entreprise : Mbarga ne voit aucun canal ni membre de Kiro", async () => {
    const membresVus = await avecEntreprise(mbargaId, (tx) => tx.select().from(membreCanal));
    expect(membresVus).toHaveLength(0);
    const canauxMbarga = await avecEntreprise(mbargaId, (tx) => canauxAccessibles(tx, adminMbarga));
    expect(canauxMbarga.every((c) => c.type !== "DIRECT")).toBe(true);
  }, 90_000);

});
