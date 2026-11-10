import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, utilisateur, rapportHierarchique } from "@/db/schema";
import { destinatairesAutorises, destinataireParDefaut, peutLireRapport, type PersonneRapport } from "@/lib/rh/rapport-hierarchique-regles";
import { destinatairesPossibles } from "@/lib/rh/rapport-hierarchique";
import { MODELES_RAPPORT, trouverModele, validerRapport } from "@/lib/rh/rapport-modeles";
import { supprimerEntrepriseDeTest } from "./aide-nettoyage";

const p = (id: string, role: string, managerId: string | null = null, statut = "ACTIF"): PersonneRapport => ({ id, nomComplet: `Nom ${id}`, role, statut, managerId });

describe("Rapports écrits — qui peut écrire à qui (règles pures)", () => {
  // admin ← directeur (manager) ← chef (manager) ← employe ; un second manager sans lien hiérarchique avec les autres
  const gens = [p("admin", "ADMIN"), p("directeur", "MANAGER", "admin"), p("chef", "MANAGER", "directeur"), p("employe", "EMPLOYE", "chef"), p("autre", "MANAGER", null), p("inactif", "MANAGER", null, "DESACTIVE"), p("client", "CLIENT")];

  test("un Employé n'écrit qu'à un Manager actif, jamais à l'Administrateur ni à un collègue", () => {
    const ids = destinatairesAutorises({ id: "employe", role: "EMPLOYE" }, gens).map((x) => x.id).sort();
    expect(ids).toEqual(["autre", "chef", "directeur"]);
  });

  test("un Manager écrit à son supérieur (toute la chaîne) et à l'Administrateur, pas à un pair ni à un subordonné", () => {
    const ids = destinatairesAutorises({ id: "chef", role: "MANAGER" }, gens).map((x) => x.id).sort();
    expect(ids).toEqual(["admin", "directeur"]);
  });

  test("un Manager sans responsable écrit à l'Administrateur", () => {
    expect(destinatairesAutorises({ id: "autre", role: "MANAGER" }, gens).map((x) => x.id)).toEqual(["admin"]);
  });

  test("un Administrateur écrit aux autres Administrateurs actifs, pas à lui-même ni aux managers", () => {
    expect(destinatairesAutorises({ id: "admin", role: "ADMIN" }, gens)).toEqual([]); // seul administrateur
    const deux = [...gens, p("admin2", "ADMIN"), p("admin3", "ADMIN", null, "DESACTIVE")];
    expect(destinatairesAutorises({ id: "admin", role: "ADMIN" }, deux).map((x) => x.id)).toEqual(["admin2"]);
  });

  test("un client ou un comptable n'écrivent pas de rapport", () => {
    expect(destinatairesAutorises({ id: "client", role: "CLIENT" }, gens)).toEqual([]);
    expect(destinatairesAutorises({ id: "x", role: "COMPTABLE" }, gens)).toEqual([]);
  });

  test("une chaîne hiérarchique qui boucle ne fait pas tourner indéfiniment", () => {
    const boucle = [p("a", "MANAGER", "b"), p("b", "MANAGER", "a"), p("admin", "ADMIN")];
    expect(destinatairesAutorises({ id: "a", role: "MANAGER" }, boucle).map((x) => x.id).sort()).toEqual(["admin", "b"]);
  });

  test("un responsable désactivé est écarté", () => {
    const g = [p("admin", "ADMIN"), p("ancien", "MANAGER", "admin", "DESACTIVE"), p("m", "MANAGER", "ancien")];
    expect(destinatairesAutorises({ id: "m", role: "MANAGER" }, g).map((x) => x.id)).toEqual(["admin"]);
  });

  test("destinataire par défaut : le responsable direct s'il est autorisé, sinon le premier", () => {
    const autorises = destinatairesAutorises({ id: "chef", role: "MANAGER" }, gens);
    expect(destinataireParDefaut("directeur", autorises)).toBe("directeur");
    expect(destinataireParDefaut("inconnu", autorises)).toBe(autorises[0].id);
    expect(destinataireParDefaut(null, [])).toBeNull();
  });

  test("seul l'auteur et le destinataire lisent un rapport", () => {
    const r = { auteurId: "employe", destinataireId: "chef" };
    expect(peutLireRapport("employe", r)).toBe(true);
    expect(peutLireRapport("chef", r)).toBe(true);
    expect(peutLireRapport("admin", r)).toBe(false);
    expect(peutLireRapport("directeur", r)).toBe(false);
  });
});

describe("Rapports écrits — base réelle et isolation entre entreprises", () => {
  const suffixe = Math.random().toString(36).slice(2, 8);
  const nomA = `TEST Rapport A ${suffixe}`;
  const nomB = `TEST Rapport B ${suffixe}`;
  let entA = "";
  let entB = "";
  let adminA = "";
  let managerA = "";
  let employeA = "";
  let adminB = "";
  let managerB = "";
  let rapportAId = "";

  beforeAll(async () => {
    const [a] = await db.insert(entreprise).values({ nom: nomA, secteurProfil: "agence" }).returning({ id: entreprise.id });
    const [b] = await db.insert(entreprise).values({ nom: nomB, secteurProfil: "agence" }).returning({ id: entreprise.id });
    entA = a.id;
    entB = b.id;
    const creer = async (entrepriseId: string, nom: string, role: "ADMIN" | "MANAGER" | "EMPLOYE", managerId?: string) => {
      const [u] = await db
        .insert(utilisateur)
        .values({ entrepriseId, email: `${nom}-${suffixe}@vertexone.test`, nomComplet: nom, role, managerId: managerId ?? null })
        .returning({ id: utilisateur.id });
      return u.id;
    };
    adminA = await creer(entA, "adminA", "ADMIN");
    managerA = await creer(entA, "managerA", "MANAGER", adminA);
    employeA = await creer(entA, "employeA", "EMPLOYE", managerA);
    adminB = await creer(entB, "adminB", "ADMIN");
    managerB = await creer(entB, "managerB", "MANAGER", adminB);

    rapportAId = await avecEntreprise(entA, async (tx) => {
      const [r] = await tx
        .insert(rapportHierarchique)
        .values({ entrepriseId: entA, auteurId: employeA, destinataireId: managerA, objet: "Bilan de la semaine", contenu: "Tout est à jour." })
        .returning({ id: rapportHierarchique.id });
      return r.id;
    });
  }, 60_000);

  afterAll(async () => {
    await supprimerEntrepriseDeTest(nomA);
    await supprimerEntrepriseDeTest(nomB);
  }, 120_000);

  test("les destinataires viennent de la base et restent dans l'entreprise de la session", async () => {
    const employe = await avecEntreprise(entA, (tx) => destinatairesPossibles(tx, { utilisateurId: employeA, entrepriseId: entA, role: "EMPLOYE" }));
    expect(employe.map((x) => x.id)).toEqual([managerA]); // jamais managerB, d'une autre entreprise

    const manager = await avecEntreprise(entA, (tx) => destinatairesPossibles(tx, { utilisateurId: managerA, entrepriseId: entA, role: "MANAGER" }));
    expect(manager.map((x) => x.id)).toEqual([adminA]);
  }, 60_000);

  test("un rapport d'une entreprise est invisible depuis une autre (fuite délibérée)", async () => {
    const vuDeB = await avecEntreprise(entB, (tx) => tx.select({ id: rapportHierarchique.id }).from(rapportHierarchique).where(eq(rapportHierarchique.id, rapportAId)));
    expect(vuDeB).toEqual([]);

    const toutDeB = await avecEntreprise(entB, (tx) => tx.select({ id: rapportHierarchique.id }).from(rapportHierarchique));
    expect(toutDeB).toEqual([]);
  }, 60_000);

  test("on ne peut pas écrire un rapport dans une autre entreprise, ni le modifier ou le supprimer", async () => {
    await expect(
      avecEntreprise(entB, (tx) => tx.insert(rapportHierarchique).values({ entrepriseId: entA, auteurId: managerB, destinataireId: adminB, objet: "Intrus", contenu: "x" })),
    ).rejects.toThrow();

    await avecEntreprise(entB, (tx) => tx.update(rapportHierarchique).set({ objet: "Piraté" }).where(eq(rapportHierarchique.id, rapportAId)));
    await avecEntreprise(entB, (tx) => tx.delete(rapportHierarchique).where(eq(rapportHierarchique.id, rapportAId)));

    const [intact] = await avecEntreprise(entA, (tx) => tx.select().from(rapportHierarchique).where(eq(rapportHierarchique.id, rapportAId)));
    expect(intact?.objet).toBe("Bilan de la semaine");
  }, 60_000);
});

describe("Rapports écrits — modèles et validation", () => {
  test("six modèles, chacun avec au moins une rubrique obligatoire et des clés uniques", () => {
    expect(MODELES_RAPPORT.map((x) => x.id)).toEqual(["MISSION", "TRAVAUX", "ACTIVITE", "INCIDENT", "DEMANDE", "LIBRE"]);
    for (const modele of MODELES_RAPPORT) {
      expect(modele.rubriques.some((r) => r.requis)).toBe(true);
      const cles = modele.rubriques.map((r) => r.cle);
      expect(new Set(cles).size).toBe(cles.length);
    }
  });

  test("un modèle inconnu est refusé", () => {
    expect(trouverModele("INVENTE")).toBeUndefined();
    expect(validerRapport("INVENTE", { contenu: "x" })).toEqual({ ok: false, erreur: "MODELE" });
  });

  test("une rubrique obligatoire vide est refusée, en nommant la rubrique", () => {
    const r = validerRapport("MISSION", { objectif: "Visiter le client", deroulement: "   ", resultats: "OK" });
    expect(r).toEqual({ ok: false, erreur: "REQUIS", rubrique: "deroulement" });
  });

  test("seules les rubriques du modèle sont retenues : une clé inventée est ignorée", () => {
    const r = validerRapport("DEMANDE", { besoin: "Un second écran", pirate: "<script>", role: "ADMIN" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.sections).toEqual([{ cle: "besoin", texte: "Un second écran" }]);
      expect(r.contenu).not.toContain("script");
    }
  });

  test("le texte complet reprend les libellés, sauf pour le rapport libre", () => {
    const mission = validerRapport("MISSION", { lieu: "Douala", objectif: "Audit", deroulement: "Visite", resultats: "Conforme" });
    expect(mission.ok && mission.contenu).toContain("Lieu :\nDouala");
    const libre = validerRapport("LIBRE", { contenu: "Bonjour" });
    expect(libre.ok && libre.contenu).toBe("Bonjour");
  });

  test("une rubrique trop longue est refusée", () => {
    expect(validerRapport("LIBRE", { contenu: "a".repeat(5001) })).toEqual({ ok: false, erreur: "TROP_LONG", rubrique: "contenu" });
    expect(validerRapport("INCIDENT", { description: "ok", lieu: "x".repeat(201) })).toEqual({ ok: false, erreur: "TROP_LONG", rubrique: "lieu" });
  });
});

