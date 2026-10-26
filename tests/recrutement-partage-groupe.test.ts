import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, groupe, utilisateur, posteOuvert, candidature } from "@/db/schema";
import { candidaturesDesPartenaires, partenairesRecrutement, postesDesPartenaires, resoudreProprietaireCandidature } from "@/lib/recrutement/partage";
import type { UtilisateurConnecte } from "@/lib/session";

/**
 * Partage du recrutement dans un groupe : exception volontaire à l'isolation entre filiales, jamais sans le réglage des DEUX entreprises, jamais
 * hors du groupe, jamais pour un Employé, et jamais en élargissant la RLS (le partage rouvre une transaction dans l'entreprise propriétaire).
 */
describe("Recrutement partagé dans un groupe", () => {
  const ids: { groupe?: string; autreGroupe?: string; a?: string; b?: string; c?: string; d?: string; ua?: string; ub?: string; uc?: string; ud?: string } = {};
  let candB: string;
  let candA: string;
  let candC: string;

  const sujet = (entrepriseId: string, utilisateurId: string, role: UtilisateurConnecte["role"]): UtilisateurConnecte => ({ entrepriseId, utilisateurId, role });

  beforeAll(async () => {
    const [g] = await db.insert(groupe).values({ nom: "TEST Groupe Recrutement" }).returning({ id: groupe.id });
    const [g2] = await db.insert(groupe).values({ nom: "TEST Autre Groupe Recrutement" }).returning({ id: groupe.id });
    ids.groupe = g.id;
    ids.autreGroupe = g2.id;
    // A et B : même groupe, partage actif des deux côtés. C : même groupe, partage NON activé. D : un autre groupe, partage activé.
    const creer = async (nom: string, groupeId: string, partage: boolean, niu: string) => {
      const [e] = await db.insert(entreprise).values({ nom, secteurProfil: "agence", niu, groupeId, recrutementPartageGroupe: partage }).returning({ id: entreprise.id });
      const [u] = await db.insert(utilisateur).values({ entrepriseId: e.id, email: `rp-${e.id}@vertexone.test`, nomComplet: `Admin ${nom}`, role: "ADMIN" }).returning({ id: utilisateur.id });
      return { e: e.id, u: u.id };
    };
    const a = await creer("TEST Recrutement A", g.id, true, "M012026000101");
    const b = await creer("TEST Recrutement B", g.id, true, "M012026000102");
    const c = await creer("TEST Recrutement C", g.id, false, "M012026000103");
    const d = await creer("TEST Recrutement D", g2.id, true, "M012026000104");
    Object.assign(ids, { a: a.e, b: b.e, c: c.e, d: d.e, ua: a.u, ub: b.u, uc: c.u, ud: d.u });

    const creerCandidature = async (ent: string, user: string, titre: string, nom: string) =>
      avecEntreprise(ent, async (tx) => {
        const [p] = await tx.insert(posteOuvert).values({ entrepriseId: ent, titre, creeParId: user }).returning({ id: posteOuvert.id });
        const [c2] = await tx
          .insert(candidature)
          .values({ entrepriseId: ent, posteId: p.id, nom, telephone: "+237600000111", cvCleStockage: `${ent}/cv/test.pdf`, cvNomFichier: "cv.pdf", cvTypeMime: "application/pdf", cvTailleOctets: 100 })
          .returning({ id: candidature.id });
        return c2.id;
      });
    candA = await creerCandidature(a.e, a.u, "Poste A", "Candidat A");
    candB = await creerCandidature(b.e, b.u, "Poste B", "Candidat B");
    candC = await creerCandidature(c.e, c.u, "Poste C", "Candidat C");
  }, 90_000);

  afterAll(async () => {
    const entreprises = [ids.a, ids.b, ids.c, ids.d].filter(Boolean) as string[];
    for (const e of entreprises) {
      await avecEntreprise(e, async (tx) => {
        await tx.delete(candidature).where(eq(candidature.entrepriseId, e));
        await tx.delete(posteOuvert).where(eq(posteOuvert.entrepriseId, e));
      });
    }
    await db.delete(utilisateur).where(inArray(utilisateur.id, [ids.ua, ids.ub, ids.uc, ids.ud].filter(Boolean) as string[]));
    await db.delete(entreprise).where(inArray(entreprise.id, entreprises));
    await db.delete(groupe).where(inArray(groupe.id, [ids.groupe, ids.autreGroupe].filter(Boolean) as string[]));
  }, 90_000);

  test("deux entreprises du même groupe se voient seulement si les DEUX ont activé le partage", async () => {
    expect((await partenairesRecrutement(ids.a!)).map((p) => p.id)).toEqual([ids.b]);
    expect((await partenairesRecrutement(ids.b!)).map((p) => p.id)).toEqual([ids.a]);
    // C n'a pas activé : ni A ni B ne la voient, et elle ne voit personne.
    expect(await partenairesRecrutement(ids.c!)).toEqual([]);
    // D est dans un autre groupe : isolée, même avec le réglage actif.
    expect(await partenairesRecrutement(ids.d!)).toEqual([]);
  }, 60_000);

  test("l'Administrateur et le Manager voient les candidatures du partenaire, avec le nom de l'entreprise ; jamais un Employé", async () => {
    const admin = await candidaturesDesPartenaires(sujet(ids.a!, ids.ua!, "ADMIN"));
    expect(admin.map((c) => c.id)).toEqual([candB]);
    expect(admin[0].entrepriseNom).toBe("TEST Recrutement B");

    expect((await candidaturesDesPartenaires(sujet(ids.a!, "manager-a", "MANAGER"))).map((c) => c.id)).toEqual([candB]);
    expect(await candidaturesDesPartenaires(sujet(ids.a!, "employe-a", "EMPLOYE"))).toEqual([]);
    expect(await candidaturesDesPartenaires(sujet(ids.a!, "client-a", "CLIENT"))).toEqual([]);
    // Jamais les candidatures de C (n'a pas activé) ni de D (autre groupe).
    expect(admin.some((c) => c.id === candC)).toBe(false);
    expect(await candidaturesDesPartenaires(sujet(ids.d!, ids.ud!, "ADMIN"))).toEqual([]);
  }, 60_000);

  test("un Manager dont l'Administrateur a fermé le module Recrutement ne voit rien du groupe", async () => {
    const ferme: UtilisateurConnecte = { entrepriseId: ids.a!, utilisateurId: "manager-ferme", role: "MANAGER", modulesAutorises: ["CRM"] };
    expect(await candidaturesDesPartenaires(ferme)).toEqual([]);
    expect(await resoudreProprietaireCandidature(ferme, candB)).toBeNull();
  }, 60_000);

  test("résoudre le propriétaire : la sienne d'abord, puis celle d'un partenaire, jamais ailleurs ni pour un Employé", async () => {
    expect(await resoudreProprietaireCandidature(sujet(ids.a!, ids.ua!, "ADMIN"), candA)).toEqual({ entrepriseId: ids.a, partagee: false });
    expect(await resoudreProprietaireCandidature(sujet(ids.a!, ids.ua!, "ADMIN"), candB)).toEqual({ entrepriseId: ids.b, partagee: true });
    expect(await resoudreProprietaireCandidature(sujet(ids.a!, "manager-a", "MANAGER"), candB)).toEqual({ entrepriseId: ids.b, partagee: true });
    expect(await resoudreProprietaireCandidature(sujet(ids.a!, "employe-a", "EMPLOYE"), candB)).toBeNull();
    expect(await resoudreProprietaireCandidature(sujet(ids.a!, ids.ua!, "ADMIN"), candC)).toBeNull(); // C n'a pas activé le partage
    expect(await resoudreProprietaireCandidature(sujet(ids.d!, ids.ud!, "ADMIN"), candB)).toBeNull(); // autre groupe
    expect(await resoudreProprietaireCandidature(sujet(ids.a!, ids.ua!, "ADMIN"), "identifiant-inexistant")).toBeNull();
  }, 60_000);

  test("la RLS reste stricte : une transaction de A ne lit toujours aucune candidature de B", async () => {
    const vues = await avecEntreprise(ids.a!, (tx) => tx.select({ id: candidature.id }).from(candidature));
    expect(vues.map((v) => v.id)).toEqual([candA]);
  }, 60_000);

  test("les postes du partenaire sont visibles en lecture seule, uniquement des entreprises partenaires", async () => {
    const postes = await postesDesPartenaires(sujet(ids.a!, ids.ua!, "ADMIN"));
    expect(postes.map((p) => p.titre)).toEqual(["Poste B"]);
    expect(postes[0].entrepriseNom).toBe("TEST Recrutement B");
  }, 60_000);

  test("couper le partage d'un côté le coupe des deux côtés", async () => {
    await db.update(entreprise).set({ recrutementPartageGroupe: false }).where(eq(entreprise.id, ids.b!));
    try {
      expect(await partenairesRecrutement(ids.a!)).toEqual([]);
      expect(await candidaturesDesPartenaires(sujet(ids.a!, ids.ua!, "ADMIN"))).toEqual([]);
      expect(await resoudreProprietaireCandidature(sujet(ids.a!, ids.ua!, "ADMIN"), candB)).toBeNull();
    } finally {
      await db.update(entreprise).set({ recrutementPartageGroupe: true }).where(eq(entreprise.id, ids.b!));
    }
  }, 60_000);
});
