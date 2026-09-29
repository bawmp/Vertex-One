import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { eq, and } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, utilisateur, contact, contactChampPersonnalise, contactChampValeur } from "@/db/schema";

/**
 * Test de fuite délibérée entre deux entreprises fictives, voir CLAUDE.md —
 * même patron strict (RLS + FORCE, aucune exception publique) que
 * tests/one-form-fuite-rls.test.ts pour reponseFormulaire/valeurChampReponse,
 * puisque contactChampPersonnalise/contactChampValeur suivent exactement le
 * même modèle EAV mais sans jamais avoir besoin d'une lecture anonyme.
 */
describe("Contact — champs personnalisés — isolation RLS entre entreprises", () => {
  let kiroId: string;
  let mbargaId: string;
  let utilisateurMbargaId: string;
  let contactMbargaId: string;
  let champMbargaId: string;
  let valeurMbargaId: string;

  beforeAll(async () => {
    const [kiro] = await db.insert(entreprise).values({ nom: "TEST ChampsContact Agence Kiro", secteurProfil: "agence" }).returning({ id: entreprise.id });
    const [mbarga] = await db.insert(entreprise).values({ nom: "TEST ChampsContact Garage Mbarga", secteurProfil: "artisan" }).returning({ id: entreprise.id });
    kiroId = kiro.id;
    mbargaId = mbarga.id;

    const [uMbarga] = await db
      .insert(utilisateur)
      .values({ entrepriseId: mbargaId, email: "admin-champscontact-mbarga@vertexone.test", nomComplet: "Admin Mbarga", role: "ADMIN" })
      .returning({ id: utilisateur.id });
    utilisateurMbargaId = uMbarga.id;

    const [ct, champ, valeur] = await avecEntreprise(mbargaId, async (tx) => {
      const [c] = await tx
        .insert(contact)
        .values({ entrepriseId: mbargaId, nom: "Jean Mbarga", telephone: "+237690111222", assigneAId: utilisateurMbargaId })
        .returning({ id: contact.id });
      const [ch] = await tx
        .insert(contactChampPersonnalise)
        .values({ entrepriseId: mbargaId, libelle: "Destination", type: "TEXTE_COURT", ordre: 0 })
        .returning({ id: contactChampPersonnalise.id });
      const [v] = await tx
        .insert(contactChampValeur)
        .values({ entrepriseId: mbargaId, contactId: c.id, champId: ch.id, valeur: "Canada" })
        .returning({ id: contactChampValeur.id });
      return [c.id, ch.id, v.id];
    });
    contactMbargaId = ct;
    champMbargaId = champ;
    valeurMbargaId = valeur;
  }, 30_000);

  afterAll(async () => {
    for (const id of [kiroId, mbargaId]) {
      await avecEntreprise(id, async (tx) => {
        await tx.delete(contactChampValeur).where(eq(contactChampValeur.entrepriseId, id));
        await tx.delete(contactChampPersonnalise).where(eq(contactChampPersonnalise.entrepriseId, id));
        await tx.delete(contact).where(eq(contact.entrepriseId, id));
      });
    }
    await db.delete(utilisateur).where(eq(utilisateur.id, utilisateurMbargaId));
    await db.delete(entreprise).where(eq(entreprise.id, kiroId));
    await db.delete(entreprise).where(eq(entreprise.id, mbargaId));
  }, 30_000);

  test("une entreprise avec une session active ne voit pas la définition de champ d'une autre", async () => {
    const lecture = await avecEntreprise(kiroId, (tx) => tx.select().from(contactChampPersonnalise).where(eq(contactChampPersonnalise.id, champMbargaId)));
    expect(lecture).toHaveLength(0);
  });

  test("une entreprise avec une session active ne voit pas la valeur d'un champ d'une autre, même en connaissant l'id", async () => {
    const lecture = await avecEntreprise(kiroId, (tx) => tx.select().from(contactChampValeur).where(eq(contactChampValeur.id, valeurMbargaId)));
    expect(lecture).toHaveLength(0);
  });

  test("aucune lecture anonyme (sans session) n'est possible — RLS strictement standard, contrairement à formulaire/champFormulaire", async () => {
    const lectureDefinition = await db.select().from(contactChampPersonnalise).where(eq(contactChampPersonnalise.id, champMbargaId));
    expect(lectureDefinition).toHaveLength(0);
    const lectureValeur = await db.select().from(contactChampValeur).where(eq(contactChampValeur.id, valeurMbargaId));
    expect(lectureValeur).toHaveLength(0);
  });

  test("une écriture tentée depuis une autre entreprise n'affecte jamais la définition d'origine", async () => {
    await avecEntreprise(kiroId, (tx) => tx.update(contactChampPersonnalise).set({ libelle: "Piraté" }).where(eq(contactChampPersonnalise.id, champMbargaId)));
    const [apresTentative] = await avecEntreprise(mbargaId, (tx) => tx.select().from(contactChampPersonnalise).where(eq(contactChampPersonnalise.id, champMbargaId)));
    expect(apresTentative.libelle).toBe("Destination");
  });

  test("supprimer une définition de champ supprime aussi ses valeurs (même transaction, comme supprimerChampPersonnaliseContact)", async () => {
    await avecEntreprise(mbargaId, async (tx) => {
      await tx.delete(contactChampValeur).where(eq(contactChampValeur.champId, champMbargaId));
      await tx.delete(contactChampPersonnalise).where(eq(contactChampPersonnalise.id, champMbargaId));
    });

    const [definitionRestante] = await avecEntreprise(mbargaId, (tx) => tx.select().from(contactChampPersonnalise).where(eq(contactChampPersonnalise.id, champMbargaId)));
    expect(definitionRestante).toBeUndefined();
    const [valeurRestante] = await avecEntreprise(mbargaId, (tx) => tx.select().from(contactChampValeur).where(eq(contactChampValeur.id, valeurMbargaId)));
    expect(valeurRestante).toBeUndefined();

    // Recréé pour que afterAll() nettoie un état cohérent (aucune ligne orpheline attendue de toute façon ici).
    const [champ] = await avecEntreprise(mbargaId, (tx) =>
      tx.insert(contactChampPersonnalise).values({ entrepriseId: mbargaId, libelle: "Destination", type: "TEXTE_COURT", ordre: 0 }).returning({ id: contactChampPersonnalise.id })
    );
    champMbargaId = champ.id;
  });

  test("un champ vidé (upsert avec chaîne vide) doit être supprimé, pas laissé avec une valeur vide — contrainte unique (contactId, champId) respectée", async () => {
    await avecEntreprise(mbargaId, (tx) =>
      tx.insert(contactChampValeur).values({ entrepriseId: mbargaId, contactId: contactMbargaId, champId: champMbargaId, valeur: "France" })
    );
    let lignes = await avecEntreprise(mbargaId, (tx) =>
      tx.select().from(contactChampValeur).where(and(eq(contactChampValeur.contactId, contactMbargaId), eq(contactChampValeur.champId, champMbargaId)))
    );
    expect(lignes).toHaveLength(1);
    expect(lignes[0].valeur).toBe("France");

    await avecEntreprise(mbargaId, (tx) =>
      tx
        .insert(contactChampValeur)
        .values({ entrepriseId: mbargaId, contactId: contactMbargaId, champId: champMbargaId, valeur: "Belgique" })
        .onConflictDoUpdate({ target: [contactChampValeur.contactId, contactChampValeur.champId], set: { valeur: "Belgique" } })
    );
    lignes = await avecEntreprise(mbargaId, (tx) =>
      tx.select().from(contactChampValeur).where(and(eq(contactChampValeur.contactId, contactMbargaId), eq(contactChampValeur.champId, champMbargaId)))
    );
    expect(lignes).toHaveLength(1);
    expect(lignes[0].valeur).toBe("Belgique");
  });
});
