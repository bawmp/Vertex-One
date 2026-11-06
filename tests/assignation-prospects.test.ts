import { describe, test, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, utilisateur, lead, cleApiEntreprise } from "@/db/schema";
import { genererCle } from "@/lib/api-externe/cle";
import { reinitialiserLimites } from "@/lib/api-externe/limite";
import { creerLeadExterne } from "@/lib/api-externe/lead";
import { choisirParTourDeRole, lireChoixAssignation, lireRegleEnregistree, regleDepuisChoix } from "@/lib/api-externe/assignation-regle";
import { receveursPossibles, validerChoixAssignation } from "@/lib/api-externe/assignation";
import { idsVisibles } from "@/lib/portee";
import type { UtilisateurConnecte } from "@/lib/session";
import { supprimerEntrepriseDeTest } from "./aide-nettoyage";

// Hors requête Next réelle : `after` exécute directement son callback, `revalidatePath` ne fait rien, l'email est espionné.
const envoyerEmail = vi.fn(async (_params: { to: string; subject: string; html: string }) => ({ envoye: true }));
vi.mock("@/lib/email/client", () => ({ envoyerEmail: (params: { to: string; subject: string; html: string }) => envoyerEmail(params) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", async () => {
  const reel = await vi.importActual<typeof import("next/server")>("next/server");
  return { ...reel, after: (fn: () => unknown) => void fn() };
});

const { POST } = await import("@/app/api/externe/leads/route");

describe("Assignation des prospects — règles pures", () => {
  test("un choix valide est lu, un choix invalide est refusé", () => {
    expect(lireChoixAssignation({ mode: "ADMIN" })).toEqual({ mode: "ADMIN" });
    expect(lireChoixAssignation({ mode: "PERSONNE", utilisateurId: "u1" })).toEqual({ mode: "PERSONNE", utilisateurId: "u1" });
    expect(lireChoixAssignation({ mode: "PERSONNE" })).toBeNull();
    expect(lireChoixAssignation({ mode: "AUTRE" })).toBeNull();
    expect(lireChoixAssignation("n'importe quoi")).toBeNull();
    expect(lireChoixAssignation(null)).toBeNull();
  });

  test("une répartition exige au moins deux personnes DIFFÉRENTES, dans l'ordre choisi", () => {
    expect(lireChoixAssignation({ mode: "REPARTITION", utilisateurIds: ["a"] })).toBeNull();
    expect(lireChoixAssignation({ mode: "REPARTITION", utilisateurIds: ["a", "a"] })).toBeNull();
    expect(lireChoixAssignation({ mode: "REPARTITION", utilisateurIds: ["b", "a", "b"] })).toEqual({ mode: "REPARTITION", utilisateurIds: ["b", "a"] });
    expect(lireChoixAssignation({ mode: "REPARTITION", utilisateurIds: Array.from({ length: 21 }, (_, i) => `u${i}`) })).toBeNull();
  });

  test("« premier administrateur » ne s'enregistre pas (null) ; une règle illisible en base retombe sur le premier administrateur", () => {
    expect(regleDepuisChoix({ mode: "ADMIN" })).toBeNull();
    expect(lireRegleEnregistree(null)).toBeNull();
    expect(lireRegleEnregistree({ mode: "ADMIN" })).toBeNull();
    expect(lireRegleEnregistree({ mode: "PERSONNE", utilisateurId: "" })).toBeNull();
    expect(lireRegleEnregistree({ mode: "PERSONNE", utilisateurId: "u1" })).toEqual({ mode: "PERSONNE", utilisateurId: "u1" });
  });

  test("le tour de rôle choisit celui qui a reçu le moins, la liste départage les égalités", () => {
    expect(choisirParTourDeRole(["a", "b", "c"], new Map())).toBe("a");
    expect(choisirParTourDeRole(["a", "b", "c"], new Map([["a", 2], ["b", 1], ["c", 1]]))).toBe("b");
    expect(choisirParTourDeRole(["a", "b"], new Map([["a", 1]]))).toBe("b");
    expect(choisirParTourDeRole([], new Map())).toBeNull();
  });
});

describe("Assignation des prospects — base réelle", () => {
  const suffixe = Math.random().toString(36).slice(2, 8);
  const nomA = `TEST Assignation A ${suffixe}`;
  const nomB = `TEST Assignation B ${suffixe}`;
  let entrepriseA = "";
  let entrepriseB = "";
  let adminA = "";
  let manager1 = "";
  let manager2 = "";
  let managerDesactive = "";
  let employeSansCrm = "";
  let clientPortail = "";
  let managerB = "";
  let compteur = 0;

  const creerUtilisateur = async (entrepriseId: string, etiquette: string, extra: Partial<typeof utilisateur.$inferInsert>) => {
    const [u] = await db
      .insert(utilisateur)
      .values({ entrepriseId, email: `${etiquette}-${suffixe}@vertexone.test`, nomComplet: `Test ${etiquette}`, ...extra })
      .returning({ id: utilisateur.id });
    return u.id;
  };

  const creerCle = async (assignation: unknown) => {
    const k = genererCle();
    const [ligne] = await avecEntreprise(entrepriseA, (tx) =>
      tx
        .insert(cleApiEntreprise)
        .values({ entrepriseId: entrepriseA, nom: `Clé ${++compteur}`, prefixe: k.prefixe, empreinte: k.empreinte, creeParId: adminA, assignation: assignation as never })
        .returning({ id: cleApiEntreprise.id })
    );
    return { cle: k.cle, id: ligne.id };
  };

  const envoyer = async (cle: string, ref: string) => {
    const r = await POST(
      new Request("https://vertexone.test/api/externe/leads", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${cle}` },
        body: JSON.stringify({ nom: `Prospect ${ref}`, telephone: "+237690000000", source: "Site Test", reference: `${suffixe}-${ref}` }),
      })
    );
    expect(r.status).toBe(201);
    const { id } = await r.json();
    const [l] = await avecEntreprise(entrepriseA, (tx) => tx.select().from(lead).where(eq(lead.id, id)));
    return l;
  };

  beforeAll(async () => {
    const [a] = await db.insert(entreprise).values({ nom: nomA, secteurProfil: "immigration" }).returning({ id: entreprise.id });
    const [b] = await db.insert(entreprise).values({ nom: nomB, secteurProfil: "agence" }).returning({ id: entreprise.id });
    entrepriseA = a.id;
    entrepriseB = b.id;
    adminA = await creerUtilisateur(entrepriseA, "admin", { role: "ADMIN" });
    manager1 = await creerUtilisateur(entrepriseA, "manager1", { role: "MANAGER", managerId: adminA });
    manager2 = await creerUtilisateur(entrepriseA, "manager2", { role: "MANAGER", managerId: adminA });
    managerDesactive = await creerUtilisateur(entrepriseA, "manager-off", { role: "MANAGER", statut: "DESACTIVE" });
    employeSansCrm = await creerUtilisateur(entrepriseA, "employe", { role: "EMPLOYE", modulesAutorises: ["RH"] });
    clientPortail = await creerUtilisateur(entrepriseA, "client", { role: "CLIENT" });
    managerB = await creerUtilisateur(entrepriseB, "managerB", { role: "MANAGER" });
  }, 90_000);

  afterAll(async () => {
    await supprimerEntrepriseDeTest(nomA);
    await supprimerEntrepriseDeTest(nomB);
  }, 90_000);

  beforeEach(() => {
    reinitialiserLimites();
    envoyerEmail.mockClear();
  });

  test("seules les personnes actives, de l'entreprise, avec accès au CRM peuvent recevoir des prospects", async () => {
    const liste = await avecEntreprise(entrepriseA, (tx) => receveursPossibles(tx, entrepriseA));
    const ids = liste.map((u) => u.id);
    expect(ids).toEqual(expect.arrayContaining([adminA, manager1, manager2]));
    expect(ids).not.toContain(managerDesactive);
    expect(ids).not.toContain(employeSansCrm); // CRM fermé par la liste de modules de l'Administrateur
    expect(ids).not.toContain(clientPortail);
    expect(ids).not.toContain(managerB); // autre entreprise
  });

  test("sans règle : le prospect va toujours au premier administrateur (comportement inchangé)", async () => {
    const { cle } = await creerCle(null);
    const l = await envoyer(cle, "defaut");
    expect(l.assigneAId).toBe(adminA);
  });

  test("règle « une personne » : le prospect va au Manager choisi, qui le VOIT dans sa portée et en est alerté", async () => {
    const { cle } = await creerCle({ mode: "PERSONNE", utilisateurId: manager1 });
    const l = await envoyer(cle, "personne");
    expect(l.assigneAId).toBe(manager1);

    // Le point de départ du problème : un Manager ne voit que les prospects de son équipe (lui compris). Celui-ci lui est assigné, donc visible.
    const sujet: UtilisateurConnecte = { utilisateurId: manager1, entrepriseId: entrepriseA, role: "MANAGER" } as UtilisateurConnecte;
    const visibles = await avecEntreprise(entrepriseA, (tx) => idsVisibles(tx, sujet, "CRM"));
    expect(visibles === "TOUT" || visibles.includes(l.assigneAId)).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(envoyerEmail).toHaveBeenCalledTimes(1);
    expect(envoyerEmail.mock.calls[0]).toEqual([expect.objectContaining({ to: `manager1-${suffixe}@vertexone.test` })]);
  });

  test("règle « tour de rôle » : les prospects sont répartis à parts égales entre les personnes choisies", async () => {
    const { cle } = await creerCle({ mode: "REPARTITION", utilisateurIds: [manager1, manager2] });
    const attribues: string[] = [];
    for (let i = 0; i < 4; i++) attribues.push((await envoyer(cle, `tour-${i}`)).assigneAId);
    expect(new Set(attribues)).toEqual(new Set([manager1, manager2]));
    const parPersonne = (id: string) => attribues.filter((a) => a === id).length;
    // Le nombre de prospects de sites déjà reçus avant ce test (« une personne » ci-dessus) décale le départ, mais les quatre derniers restent à 2 / 2.
    expect(parPersonne(manager1)).toBe(2);
    expect(parPersonne(manager2)).toBe(2);
  });

  test("une personne désactivée ou sans accès au CRM ne reçoit rien : retour au premier administrateur, jamais un prospect perdu", async () => {
    for (const [i, inapte] of [managerDesactive, employeSansCrm, clientPortail].entries()) {
      const { cle } = await creerCle({ mode: "PERSONNE", utilisateurId: inapte });
      const l = await envoyer(cle, `inapte-${i}`);
      expect(l.assigneAId).toBe(adminA);
    }
    // Une règle qui cite une personne d'une AUTRE entreprise (base corrompue ou forgée) retombe aussi sur l'administrateur.
    const { cle } = await creerCle({ mode: "PERSONNE", utilisateurId: managerB });
    expect((await envoyer(cle, "autre-entreprise")).assigneAId).toBe(adminA);
  });

  test("répartition dont une partie des personnes est inapte : seules les personnes aptes reçoivent", async () => {
    const { cle } = await creerCle({ mode: "REPARTITION", utilisateurIds: [managerDesactive, manager2] });
    const l = await envoyer(cle, "mixte");
    expect(l.assigneAId).toBe(manager2);
  });

  test("la règle d'une page Facebook ou d'une clé passe par le même chemin : creerLeadExterne applique la règle reçue", async () => {
    const resultat = await avecEntreprise(entrepriseA, (tx) =>
      creerLeadExterne(tx, entrepriseA, { nom: "Prospect Facebook", telephone: "690111222", source: "Facebook", reference: `fb-${suffixe}`, miseAJour: false }, { mode: "PERSONNE", utilisateurId: manager2 })
    );
    expect("erreur" in resultat).toBe(false);
    if ("erreur" in resultat) return;
    expect(resultat.assigneEmail).toBe(`manager2-${suffixe}@vertexone.test`);
    const [l] = await avecEntreprise(entrepriseA, (tx) => tx.select().from(lead).where(and(eq(lead.id, resultat.id), eq(lead.entrepriseId, entrepriseA))));
    expect(l.assigneAId).toBe(manager2);
  });

  test("un renvoi de la même référence reste un doublon : la règle ne crée jamais un second prospect", async () => {
    const { cle } = await creerCle({ mode: "PERSONNE", utilisateurId: manager1 });
    const premier = await envoyer(cle, "doublon");
    const r = await POST(
      new Request("https://vertexone.test/api/externe/leads", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${cle}` },
        body: JSON.stringify({ nom: "Prospect doublon", telephone: "+237690000000", source: "Site Test", reference: `${suffixe}-doublon` }),
      })
    );
    expect(r.status).toBe(200);
    expect((await r.json()).id).toBe(premier.id);
  });

  test("le choix envoyé par le navigateur est revalidé : forme, personne d'une autre entreprise, inapte (fuite entre entreprises)", async () => {
    const valider = (brut: unknown) => avecEntreprise(entrepriseA, (tx) => validerChoixAssignation(tx, entrepriseA, brut));

    expect(await valider({ mode: "ADMIN" })).toEqual({ regle: null });
    expect(await valider({ mode: "PERSONNE", utilisateurId: manager1 })).toEqual({ regle: { mode: "PERSONNE", utilisateurId: manager1 } });
    expect(await valider({ mode: "REPARTITION", utilisateurIds: [manager1, manager2] })).toEqual({ regle: { mode: "REPARTITION", utilisateurIds: [manager1, manager2] } });

    expect(await valider({ mode: "PERSONNE", utilisateurId: managerB })).toEqual({ erreur: "PERSONNE_INVALIDE" }); // une personne de l'entreprise B
    expect(await valider({ mode: "REPARTITION", utilisateurIds: [manager1, managerB] })).toEqual({ erreur: "PERSONNE_INVALIDE" });
    expect(await valider({ mode: "PERSONNE", utilisateurId: managerDesactive })).toEqual({ erreur: "PERSONNE_INVALIDE" });
    expect(await valider({ mode: "PERSONNE", utilisateurId: clientPortail })).toEqual({ erreur: "PERSONNE_INVALIDE" });
    expect(await valider({ mode: "PERSONNE", utilisateurId: "inexistant" })).toEqual({ erreur: "PERSONNE_INVALIDE" });
    expect(await valider({ mode: "REPARTITION", utilisateurIds: [manager1] })).toEqual({ erreur: "FORME" });
    expect(await valider("n'importe quoi")).toEqual({ erreur: "FORME" });
  });
});
