import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, utilisateur, formulaire, champFormulaire, reponseFormulaire, valeurChampReponse } from "@/db/schema";

/**
 * Test de fuite délibérée entre deux entreprises fictives pour les 4 tables
 * One Form — voir CLAUDE.md. `formulaire`/`champFormulaire` suivent le même
 * patron d'exception que `pageAtterrissage` (lecture publique uniquement
 * quand publié + aucune session active, voir tests/palier-6-fuite-rls.test.ts) ;
 * `reponseFormulaire`/`valeurChampReponse` restent en RLS strictement
 * standard (aucune lecture ni écriture anonyme), voir src/db/schema.ts.
 */
describe("One Form — isolation RLS entre entreprises", () => {
  let kiroId: string;
  let mbargaId: string;
  let utilisateurMbargaId: string;
  let formulaireMbargaId: string;
  let champMbargaId: string;
  let reponseMbargaId: string;
  let valeurMbargaId: string;

  beforeAll(async () => {
    const [kiro] = await db.insert(entreprise).values({ nom: "TEST OneForm Agence Kiro", secteurProfil: "agence" }).returning({ id: entreprise.id });
    const [mbarga] = await db.insert(entreprise).values({ nom: "TEST OneForm Garage Mbarga", secteurProfil: "artisan" }).returning({ id: entreprise.id });
    kiroId = kiro.id;
    mbargaId = mbarga.id;

    const [uMbarga] = await db
      .insert(utilisateur)
      .values({ entrepriseId: mbargaId, email: "admin-oneform-mbarga@vertexone.test", nomComplet: "Admin Mbarga", role: "ADMIN" })
      .returning({ id: utilisateur.id });
    utilisateurMbargaId = uMbarga.id;

    const [f, c, r, v] = await avecEntreprise(mbargaId, async (tx) => {
      const [form] = await tx
        .insert(formulaire)
        .values({ entrepriseId: mbargaId, titre: "Demande de devis", slug: `devis-mbarga-${mbargaId}`, publie: false, creeParId: utilisateurMbargaId })
        .returning({ id: formulaire.id });
      const [champ] = await tx
        .insert(champFormulaire)
        .values({ entrepriseId: mbargaId, formulaireId: form.id, type: "TEXTE_COURT", libelle: "Votre nom", ordre: 0 })
        .returning({ id: champFormulaire.id });
      const [reponse] = await tx
        .insert(reponseFormulaire)
        .values({ entrepriseId: mbargaId, formulaireId: form.id })
        .returning({ id: reponseFormulaire.id });
      const [valeur] = await tx
        .insert(valeurChampReponse)
        .values({ entrepriseId: mbargaId, reponseFormulaireId: reponse.id, champFormulaireId: champ.id, valeur: "Jean Mbarga" })
        .returning({ id: valeurChampReponse.id });
      return [form.id, champ.id, reponse.id, valeur.id];
    });
    formulaireMbargaId = f;
    champMbargaId = c;
    reponseMbargaId = r;
    valeurMbargaId = v;
  }, 30_000);

  afterAll(async () => {
    for (const id of [kiroId, mbargaId]) {
      await avecEntreprise(id, async (tx) => {
        await tx.delete(valeurChampReponse).where(eq(valeurChampReponse.entrepriseId, id));
        await tx.delete(reponseFormulaire).where(eq(reponseFormulaire.entrepriseId, id));
        await tx.delete(champFormulaire).where(eq(champFormulaire.entrepriseId, id));
        await tx.delete(formulaire).where(eq(formulaire.entrepriseId, id));
      });
    }
    await db.delete(utilisateur).where(eq(utilisateur.id, utilisateurMbargaId));
    await db.delete(entreprise).where(eq(entreprise.id, kiroId));
    await db.delete(entreprise).where(eq(entreprise.id, mbargaId));
  }, 30_000);

  test("une entreprise avec une session active ne voit pas le formulaire non publié d'une autre", async () => {
    const lecture = await avecEntreprise(kiroId, (tx) => tx.select().from(formulaire).where(eq(formulaire.id, formulaireMbargaId)));
    expect(lecture).toHaveLength(0);
  });

  test("un formulaire non publié reste invisible même sans session active", async () => {
    const lecture = await db.select().from(formulaire).where(eq(formulaire.id, formulaireMbargaId));
    expect(lecture).toHaveLength(0);
    const lectureChamp = await db.select().from(champFormulaire).where(eq(champFormulaire.id, champMbargaId));
    expect(lectureChamp).toHaveLength(0);
  });

  test("un formulaire publié et ses champs deviennent lisibles sans session, mais restent non modifiables", async () => {
    await avecEntreprise(mbargaId, (tx) => tx.update(formulaire).set({ publie: true }).where(eq(formulaire.id, formulaireMbargaId)));

    const [lecturePublique] = await db.select().from(formulaire).where(eq(formulaire.id, formulaireMbargaId));
    expect(lecturePublique).toBeDefined();
    expect(lecturePublique.publie).toBe(true);

    const lectureChamps = await db.select().from(champFormulaire).where(eq(champFormulaire.formulaireId, formulaireMbargaId));
    expect(lectureChamps).toHaveLength(1);

    await db.update(formulaire).set({ titre: "Piraté" }).where(eq(formulaire.id, formulaireMbargaId));
    const [apresTentative] = await db.select().from(formulaire).where(eq(formulaire.id, formulaireMbargaId));
    expect(apresTentative.titre).not.toBe("Piraté");
  });

  test("une entreprise ne voit pas les réponses ni les valeurs d'une autre", async () => {
    const lectureReponses = await avecEntreprise(kiroId, (tx) => tx.select().from(reponseFormulaire).where(eq(reponseFormulaire.id, reponseMbargaId)));
    expect(lectureReponses).toHaveLength(0);

    const lectureValeurs = await avecEntreprise(kiroId, (tx) => tx.select().from(valeurChampReponse).where(eq(valeurChampReponse.id, valeurMbargaId)));
    expect(lectureValeurs).toHaveLength(0);
  });

  test("une réponse et sa valeur restent invisibles sans session, même une fois le formulaire parent publié", async () => {
    const lectureReponses = await db.select().from(reponseFormulaire).where(eq(reponseFormulaire.id, reponseMbargaId));
    expect(lectureReponses).toHaveLength(0);

    const lectureValeurs = await db.select().from(valeurChampReponse).where(eq(valeurChampReponse.id, valeurMbargaId));
    expect(lectureValeurs).toHaveLength(0);
  });
});
