import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { entreprise, utilisateur, membrePlateforme } from "@/db/schema";
import { niveauPlateforme } from "@/lib/plateforme/acces-logique";
import { ajouterMembreEquipe, listerMembresEquipe, revoquerMembreEquipe } from "@/lib/plateforme/equipe";

const PROPRIETAIRE = "proprietaire-eq@vertexone.test";

describe("Niveau d'accès à la console plateforme — logique pure", () => {
  test("propriétaire = liste blanche ; équipe = membre actif ; sinon aucun accès", () => {
    expect(niveauPlateforme("Proprietaire@Exemple.test", "proprietaire@exemple.test, autre@exemple.test", [])).toBe("PROPRIETAIRE");
    expect(niveauPlateforme("equipe@exemple.test", "proprietaire@exemple.test", ["Equipe@Exemple.test"])).toBe("EQUIPE");
    expect(niveauPlateforme("inconnu@exemple.test", "proprietaire@exemple.test", ["equipe@exemple.test"])).toBeNull();
    expect(niveauPlateforme(null, "proprietaire@exemple.test", [])).toBeNull();
    expect(niveauPlateforme("equipe@exemple.test", undefined, [])).toBeNull();
  });

  test("un membre de l'équipe n'est jamais propriétaire, même s'il est aussi dans la table", () => {
    expect(niveauPlateforme("equipe@exemple.test", "proprietaire@exemple.test", ["equipe@exemple.test"])).toBe("EQUIPE");
  });
});

describe("Équipe de la console plateforme — ajout et retrait par le propriétaire", () => {
  let entrepriseId: string;
  let utilisateurActifId: string;
  let utilisateurDesactiveId: string;
  const emailActif = `eq-actif-${Date.now()}@vertexone.test`;
  const emailDesactive = `eq-desactive-${Date.now()}@vertexone.test`;

  beforeAll(async () => {
    const [e] = await db.insert(entreprise).values({ nom: "TEST Equipe Plateforme", secteurProfil: "agence", niu: "M012026000111" }).returning({ id: entreprise.id });
    entrepriseId = e.id;
    const [u] = await db.insert(utilisateur).values({ entrepriseId, email: emailActif, nomComplet: "Collègue Actif", role: "ADMIN" }).returning({ id: utilisateur.id });
    utilisateurActifId = u.id;
    const [u2] = await db.insert(utilisateur).values({ entrepriseId, email: emailDesactive, nomComplet: "Collègue Désactivé", role: "ADMIN", statut: "DESACTIVE" }).returning({ id: utilisateur.id });
    utilisateurDesactiveId = u2.id;
  }, 60_000);

  afterAll(async () => {
    await db.delete(membrePlateforme).where(inArray(membrePlateforme.email, [emailActif, emailDesactive]));
    await db.delete(utilisateur).where(inArray(utilisateur.id, [utilisateurActifId, utilisateurDesactiveId]));
    await db.delete(entreprise).where(eq(entreprise.id, entrepriseId));
  }, 60_000);

  test("on ne peut ajouter qu'une personne qui a déjà un compte actif (sinon quelqu'un pourrait créer le compte avant elle)", async () => {
    expect((await ajouterMembreEquipe(PROPRIETAIRE, `inexistant-${Date.now()}@vertexone.test`, PROPRIETAIRE)).erreur).toContain("Aucun compte actif");
    expect((await ajouterMembreEquipe(PROPRIETAIRE, emailDesactive, PROPRIETAIRE)).erreur).toContain("Aucun compte actif");
    expect((await ajouterMembreEquipe(PROPRIETAIRE, "pas-un-email", PROPRIETAIRE)).erreur).toBe("Adresse email invalide.");
  }, 60_000);

  test("ajout, doublon refusé, un propriétaire n'a pas à figurer dans la table", async () => {
    expect(await ajouterMembreEquipe(PROPRIETAIRE, emailActif.toUpperCase(), PROPRIETAIRE)).toEqual({});
    const membres = await listerMembresEquipe();
    const m = membres.find((x) => x.email === emailActif);
    expect(m?.revoqueLe).toBeNull();
    expect(m?.ajouteParEmail).toBe(PROPRIETAIRE);
    expect((await ajouterMembreEquipe(PROPRIETAIRE, emailActif, PROPRIETAIRE)).erreur).toContain("déjà");
    expect((await ajouterMembreEquipe(PROPRIETAIRE, PROPRIETAIRE, PROPRIETAIRE)).erreur).toContain("propriétaire");
  }, 60_000);

  test("retrait : la ligne est gardée avec qui l'a retiré ; on ne se retire pas soi-même ; rétablissement possible", async () => {
    const [m] = await db.select().from(membrePlateforme).where(eq(membrePlateforme.email, emailActif));
    expect((await revoquerMembreEquipe(emailActif, m.id)).erreur).toBeDefined(); // pas soi-même
    expect(await revoquerMembreEquipe(PROPRIETAIRE, m.id)).toEqual({});
    const [apres] = await db.select().from(membrePlateforme).where(eq(membrePlateforme.id, m.id));
    expect(apres.revoqueLe).toBeInstanceOf(Date);
    expect(apres.revoqueParEmail).toBe(PROPRIETAIRE);
    expect((await revoquerMembreEquipe(PROPRIETAIRE, m.id)).erreur).toBeDefined(); // déjà retiré
    // niveau d'accès : plus d'équipe une fois retiré
    expect(niveauPlateforme(emailActif, PROPRIETAIRE, (await db.select().from(membrePlateforme)).filter((x) => !x.revoqueLe).map((x) => x.email))).toBeNull();
    // rétablissement
    expect(await ajouterMembreEquipe(PROPRIETAIRE, emailActif, PROPRIETAIRE)).toEqual({});
    const [reactive] = await db.select().from(membrePlateforme).where(eq(membrePlateforme.id, m.id));
    expect(reactive.revoqueLe).toBeNull();
  }, 60_000);
});
