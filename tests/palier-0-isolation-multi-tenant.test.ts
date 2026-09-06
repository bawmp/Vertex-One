import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, invitation } from "@/db/schema";

/**
 * Test de fuite délibérée entre deux entreprises fictives — voir
 * docs/palier-0-*, section 9, étape 5 : "ce test doit échouer pour valider
 * le socle". Reproduit l'exemple "Agence Kiro / Garage Mbarga" de la
 * section 7 : deux entreprises, chacune avec sa propre invitation, et on
 * vérifie qu'aucune ne peut voir ni modifier les données de l'autre — ni en
 * lecture large, ni en ciblant précisément l'id de l'autre, ni en écriture.
 */
describe("Palier 0 — isolation RLS entre entreprises", () => {
  let kiroId: string;
  let mbargaId: string;
  let invitationKiroId: string;
  let invitationMbargaId: string;

  beforeAll(async () => {
    const [kiro] = await db.insert(entreprise).values({ nom: "TEST Agence Kiro", secteurProfil: "agence" }).returning({ id: entreprise.id });
    const [mbarga] = await db.insert(entreprise).values({ nom: "TEST Garage Mbarga", secteurProfil: "artisan" }).returning({ id: entreprise.id });
    kiroId = kiro.id;
    mbargaId = mbarga.id;

    // Jeton suffixé par kiroId/mbargaId (uniques par exécution, entreprise
    // insérée sans nettoyage préalable possible) plutôt qu'une chaîne fixe :
    // un run précédent interrompu avant afterAll (crash, Ctrl+C) laissait une
    // ligne orpheline avec le même jeton fixe, ce qui faisait échouer toute
    // exécution suivante sur "invitation_jeton_unique" — pas un bug
    // applicatif, un défaut de robustesse du test lui-même.
    const [invKiro] = await avecEntreprise(kiroId, (tx) =>
      tx
        .insert(invitation)
        .values({
          entrepriseId: kiroId,
          email: "employe@kiro.test",
          roleProposee: "EMPLOYE",
          jeton: `jeton-test-kiro-${kiroId}`,
          expireLe: new Date(Date.now() + 1000 * 60 * 60),
        })
        .returning({ id: invitation.id })
    );
    const [invMbarga] = await avecEntreprise(mbargaId, (tx) =>
      tx
        .insert(invitation)
        .values({
          entrepriseId: mbargaId,
          email: "employe@mbarga.test",
          roleProposee: "EMPLOYE",
          jeton: `jeton-test-mbarga-${mbargaId}`,
          expireLe: new Date(Date.now() + 1000 * 60 * 60),
        })
        .returning({ id: invitation.id })
    );
    invitationKiroId = invKiro.id;
    invitationMbargaId = invMbarga.id;
  });

  afterAll(async () => {
    await avecEntreprise(kiroId, (tx) => tx.delete(invitation).where(eq(invitation.entrepriseId, kiroId)));
    await avecEntreprise(mbargaId, (tx) => tx.delete(invitation).where(eq(invitation.entrepriseId, mbargaId)));
    await db.delete(entreprise).where(eq(entreprise.id, kiroId));
    await db.delete(entreprise).where(eq(entreprise.id, mbargaId));
  });

  test("une entreprise ne voit que ses propres invitations en lecture large", async () => {
    const vuesParKiro = await avecEntreprise(kiroId, (tx) => tx.select().from(invitation));

    expect(vuesParKiro.some((i) => i.id === invitationKiroId)).toBe(true);
    expect(vuesParKiro.some((i) => i.id === invitationMbargaId)).toBe(false);
  });

  test("une entreprise ne peut pas lire l'invitation d'une autre même en ciblant son id précis", async () => {
    const tentative = await avecEntreprise(kiroId, (tx) =>
      tx.select().from(invitation).where(eq(invitation.id, invitationMbargaId))
    );

    expect(tentative).toHaveLength(0);
  });

  test("une entreprise ne peut pas modifier l'invitation d'une autre", async () => {
    await avecEntreprise(kiroId, (tx) =>
      tx.update(invitation).set({ postePropose: "Piraté depuis Kiro" }).where(eq(invitation.id, invitationMbargaId))
    );

    const [ligneReelle] = await avecEntreprise(mbargaId, (tx) =>
      tx.select().from(invitation).where(eq(invitation.id, invitationMbargaId))
    );

    expect(ligneReelle.postePropose).not.toBe("Piraté depuis Kiro");
  });

  test("une entreprise ne peut pas supprimer l'invitation d'une autre", async () => {
    await avecEntreprise(kiroId, (tx) => tx.delete(invitation).where(eq(invitation.id, invitationMbargaId)));

    const [toujoursLa] = await avecEntreprise(mbargaId, (tx) =>
      tx.select().from(invitation).where(eq(invitation.id, invitationMbargaId))
    );

    expect(toujoursLa).toBeDefined();
  });
});
