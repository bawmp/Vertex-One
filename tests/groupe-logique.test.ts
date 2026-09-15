import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { entreprise, groupe, invitationGroupe } from "@/db/schema";
import { creerGroupePour, genererInvitationGroupePour, rattacherFilialeAuGroupePour, quitterGroupePour } from "@/lib/groupe/logique";

/**
 * Groupe d'entreprises (2026-09-15) — lien purement organisationnel entre
 * entreprises par ailleurs totalement indépendantes (voir
 * docs/crm-roadmap-post-commercialisation.md). Ni `groupe` ni
 * `invitationGroupe` n'ont de RLS (voir src/db/schema.ts, même statut que
 * `entreprise` elle-même) — pas de test "fuite RLS" au sens habituel ; ces
 * tests prouvent plutôt que le filtre applicatif par `groupeId` isole
 * correctement deux groupes entre eux.
 */
describe("Groupe d'entreprises — logique", () => {
  let entrepriseAId: string;
  let entrepriseBId: string;
  let entrepriseCId: string; // groupe totalement différent, pour l'isolation
  const groupesACreer: string[] = [];

  beforeAll(async () => {
    const [a] = await db.insert(entreprise).values({ nom: "TEST Groupe A", secteurProfil: "agence" }).returning({ id: entreprise.id });
    const [b] = await db.insert(entreprise).values({ nom: "TEST Groupe B", secteurProfil: "artisan" }).returning({ id: entreprise.id });
    const [c] = await db.insert(entreprise).values({ nom: "TEST Groupe C", secteurProfil: "cabinet" }).returning({ id: entreprise.id });
    entrepriseAId = a.id;
    entrepriseBId = b.id;
    entrepriseCId = c.id;
  }, 30_000);

  afterAll(async () => {
    // entreprise.groupeId référence groupe.id — toujours détacher/supprimer
    // les entreprises avant de supprimer les groupes eux-mêmes.
    await db.delete(entreprise).where(eq(entreprise.id, entrepriseAId));
    await db.delete(entreprise).where(eq(entreprise.id, entrepriseBId));
    await db.delete(entreprise).where(eq(entreprise.id, entrepriseCId));
    for (const gId of groupesACreer) {
      await db.delete(invitationGroupe).where(eq(invitationGroupe.groupeId, gId));
      await db.delete(groupe).where(eq(groupe.id, gId));
    }
  });

  test("créer un groupe, puis rattacher une deuxième entreprise via un code valide", async () => {
    const resultatCreation = await creerGroupePour(entrepriseAId, "Groupe Test");
    expect(resultatCreation).toBeNull();

    const [aApres] = await db.select({ groupeId: entreprise.groupeId }).from(entreprise).where(eq(entreprise.id, entrepriseAId));
    expect(aApres.groupeId).not.toBeNull();
    groupesACreer.push(aApres.groupeId as string);

    const resultatCode = await genererInvitationGroupePour(entrepriseAId);
    expect(resultatCode?.succes).toBeTruthy();

    const resultatRattachement = await rattacherFilialeAuGroupePour(entrepriseBId, resultatCode!.succes as string);
    expect(resultatRattachement).toBeNull();

    const [bApres] = await db.select({ groupeId: entreprise.groupeId }).from(entreprise).where(eq(entreprise.id, entrepriseBId));
    expect(bApres.groupeId).toBe(aApres.groupeId);
  });

  test("un code déjà utilisé est refusé", async () => {
    const resultatCode = await genererInvitationGroupePour(entrepriseAId);
    const jeton = resultatCode!.succes as string;

    await rattacherFilialeAuGroupePour(entrepriseCId, jeton);
    // Remise à zéro immédiate pour ne pas fausser le test suivant : C rejoint puis quitte.
    await quitterGroupePour(entrepriseCId);

    const reutilisation = await rattacherFilialeAuGroupePour(entrepriseCId, jeton);
    expect(reutilisation?.erreur).toContain("invalide");
  });

  test("une entreprise déjà dans un groupe ne peut pas en créer un autre, ni en rejoindre un second", async () => {
    const refusCreation = await creerGroupePour(entrepriseBId, "Autre groupe");
    expect(refusCreation?.erreur).toContain("déjà");

    const refusRattachement = await rattacherFilialeAuGroupePour(entrepriseBId, "un-jeton-quelconque");
    expect(refusRattachement?.erreur).toContain("déjà");
  });

  test("quitter un groupe puis pouvoir en rejoindre un autre", async () => {
    await quitterGroupePour(entrepriseBId);
    const [bApresDepart] = await db.select({ groupeId: entreprise.groupeId }).from(entreprise).where(eq(entreprise.id, entrepriseBId));
    expect(bApresDepart.groupeId).toBeNull();

    const [nouveauGroupe] = await db.insert(groupe).values({ nom: "TEST Groupe Nouveau" }).returning({ id: groupe.id });
    groupesACreer.push(nouveauGroupe.id);
    // Jeton dérivé de l'id généré à l'exécution, jamais codé en dur (voir
    // CLAUDE.md — résidus de tests interrompus, même s'ils sont rares ici
    // puisque ces tables n'ont pas de RLS à nettoyer par avecEntreprise()).
    const [invitation] = await db
      .insert(invitationGroupe)
      .values({ groupeId: nouveauGroupe.id, jeton: `jeton-test-groupe-${nouveauGroupe.id}`, expireLe: new Date(Date.now() + 60_000) })
      .returning({ jeton: invitationGroupe.jeton });

    const resultat = await rattacherFilialeAuGroupePour(entrepriseBId, invitation.jeton);
    expect(resultat).toBeNull();
    const [bFinal] = await db.select({ groupeId: entreprise.groupeId }).from(entreprise).where(eq(entreprise.id, entrepriseBId));
    expect(bFinal.groupeId).toBe(nouveauGroupe.id);
  });

  test("la liste des filiales d'un groupe n'inclut jamais une entreprise d'un autre groupe", async () => {
    const [gX] = await db.insert(groupe).values({ nom: "TEST Groupe X" }).returning({ id: groupe.id });
    const [gY] = await db.insert(groupe).values({ nom: "TEST Groupe Y" }).returning({ id: groupe.id });
    groupesACreer.push(gX.id, gY.id);

    await db.update(entreprise).set({ groupeId: gX.id }).where(eq(entreprise.id, entrepriseAId));
    await db.update(entreprise).set({ groupeId: gY.id }).where(eq(entreprise.id, entrepriseCId));

    const filialesDeX = await db.select({ id: entreprise.id }).from(entreprise).where(eq(entreprise.groupeId, gX.id));
    expect(filialesDeX.map((f) => f.id)).toContain(entrepriseAId);
    expect(filialesDeX.map((f) => f.id)).not.toContain(entrepriseCId);
  });
});
