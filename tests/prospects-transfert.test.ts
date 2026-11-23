import { describe, test, expect, beforeAll, afterAll, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, utilisateur, lead, relanceProspect } from "@/db/schema";
import { supprimerEntrepriseDeTest } from "./aide-nettoyage";

vi.mock("server-only", () => ({}));

const { transfererProspect, collaborateursPourTransfert, peutTransfererProspect } = await import("@/lib/crm/transfert-prospect");

// Transfert d'un prospect à un collègue de la même entreprise : Administrateur et Managers seulement ; base réelle (RLS, portée), aucun email réel
// (la fonction ne fait que PRÉPARER le courrier, c'est l'action qui l'envoie après la réponse).
const suffixe = Math.random().toString(36).slice(2, 8);
const nomA = `TEST Transfert prospect A ${suffixe}`;
const nomB = `TEST Transfert prospect B ${suffixe}`;
let idA = "", idB = "";
let adminA = "", managerA = "", employeA = "", employeInactif = "", employeSansCrm = "", adminB = "";

type Connecte = { entrepriseId: string; utilisateurId: string; role: "ADMIN" | "MANAGER" | "EMPLOYE"; modulesAutorises: null };
const qui = (entrepriseId: string, utilisateurId: string, role: Connecte["role"]): never => ({ entrepriseId, utilisateurId, role, modulesAutorises: null }) as never;

const creerLead = (entrepriseId: string, assigneAId: string, extra: Partial<typeof lead.$inferInsert> = {}) =>
  avecEntreprise(entrepriseId, async (tx) => (await tx.insert(lead).values({ entrepriseId, nom: "Prospect à transférer", telephone: "690 11 12 22", email: `p-${suffixe}@client.test`, statut: "QUALIFIE", assigneAId, ...extra }).returning({ id: lead.id }))[0].id);
const leadDe = (entrepriseId: string, id: string) => avecEntreprise(entrepriseId, async (tx) => (await tx.select().from(lead).where(eq(lead.id, id)))[0]);
const notesDe = (entrepriseId: string, leadId: string) => avecEntreprise(entrepriseId, (tx) => tx.select().from(relanceProspect).where(eq(relanceProspect.leadId, leadId)));
const transferer = (entrepriseId: string, auteur: never, leadId: string, destinataireId: string, motif = "") => avecEntreprise(entrepriseId, (tx) => transfererProspect(tx, auteur, leadId, destinataireId, motif));

beforeAll(async () => {
  process.env.BETTER_AUTH_SECRET ??= "secret-de-test-assez-long-pour-etre-valide";
  const [a] = await db.insert(entreprise).values({ nom: nomA, secteurProfil: "agence" }).returning({ id: entreprise.id });
  const [b] = await db.insert(entreprise).values({ nom: nomB, secteurProfil: "agence" }).returning({ id: entreprise.id });
  idA = a.id;
  idB = b.id;
  const crees = await db
    .insert(utilisateur)
    .values([
      { entrepriseId: idA, email: `admin-a-${suffixe}@vertexone.test`, nomComplet: "Admin A", role: "ADMIN", statut: "ACTIF" },
      { entrepriseId: idA, email: `manager-a-${suffixe}@vertexone.test`, nomComplet: "Manager A", role: "MANAGER", statut: "ACTIF" },
      { entrepriseId: idA, email: `employe-a-${suffixe}@vertexone.test`, nomComplet: "Employe A", role: "EMPLOYE", statut: "ACTIF" },
      { entrepriseId: idA, email: `inactif-a-${suffixe}@vertexone.test`, nomComplet: "Inactif A", role: "EMPLOYE", statut: "DESACTIVE" },
      { entrepriseId: idA, email: `sanscrm-a-${suffixe}@vertexone.test`, nomComplet: "Sans CRM A", role: "EMPLOYE", statut: "ACTIF", modulesAutorises: ["RH"] },
      { entrepriseId: idB, email: `admin-b-${suffixe}@vertexone.test`, nomComplet: "Admin B", role: "ADMIN", statut: "ACTIF" },
    ])
    .returning({ id: utilisateur.id, email: utilisateur.email });
  const id = (debut: string) => crees.find((u) => u.email.startsWith(debut))!.id;
  adminA = id("admin-a");
  managerA = id("manager-a");
  employeA = id("employe-a");
  employeInactif = id("inactif-a");
  employeSansCrm = id("sanscrm-a");
  adminB = id("admin-b");
}, 60_000);

afterAll(async () => {
  await supprimerEntrepriseDeTest(nomA);
  await supprimerEntrepriseDeTest(nomB);
}, 60_000);

describe("Transférer un prospect à un collègue", () => {
  test("l'Administrateur confie un prospect : la personne change, l'historique le note, un courrier est préparé (texte saisi échappé)", async () => {
    const l = await creerLead(idA, adminA, { nom: "Marie <b>Test</b>" });
    const r = await transferer(idA, qui(idA, adminA, "ADMIN"), l, employeA, "Elle attend un devis <script>x</script>");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.destinataire).toBe("Employe A");
    expect((await leadDe(idA, l)).assigneAId).toBe(employeA);

    const notes = await notesDe(idA, l);
    expect(notes).toHaveLength(1);
    expect(notes[0].canal).toBe("note");
    expect(notes[0].contenu).toContain("Admin A");
    expect(notes[0].contenu).toContain("Employe A");

    expect(r.email?.to).toBe(`employe-a-${suffixe}@vertexone.test`);
    expect(r.email?.html).toContain("Employe A");
    expect(r.email?.html).not.toContain("<script>");
    expect(r.email?.html).not.toContain("<b>Test</b>");
    expect(r.email?.html).toContain(`/app/leads/${l}`);
  });

  test("un Manager transfère un prospect de sa portée, jamais celui d'une personne hors de son équipe", async () => {
    const aLui = await creerLead(idA, managerA);
    const horsEquipe = await creerLead(idA, adminA);
    const ok = await transferer(idA, qui(idA, managerA, "MANAGER"), aLui, employeA);
    expect(ok.ok).toBe(true);
    expect((await leadDe(idA, aLui)).assigneAId).toBe(employeA);

    const refus = await transferer(idA, qui(idA, managerA, "MANAGER"), horsEquipe, employeA);
    expect(refus.ok).toBe(false);
    expect((await leadDe(idA, horsEquipe)).assigneAId).toBe(adminA);
    expect(await notesDe(idA, horsEquipe)).toHaveLength(0);
  });

  test("un Employé ne peut pas transférer, même son propre prospect", async () => {
    const l = await creerLead(idA, employeA);
    const r = await transferer(idA, qui(idA, employeA, "EMPLOYE"), l, managerA);
    expect(r.ok).toBe(false);
    expect((await leadDe(idA, l)).assigneAId).toBe(employeA);
    expect(peutTransfererProspect(qui(idA, employeA, "EMPLOYE"))).toBe(false);
    expect(peutTransfererProspect(qui(idA, managerA, "MANAGER"))).toBe(true);
    expect(peutTransfererProspect(qui(idA, adminA, "ADMIN"))).toBe(true);
  });

  test("le destinataire doit être un collègue actif de la même entreprise qui peut travailler le CRM", async () => {
    const l = await creerLead(idA, adminA);
    for (const destinataire of [adminB, employeInactif, employeSansCrm, "identifiant-inventé"]) {
      const r = await transferer(idA, qui(idA, adminA, "ADMIN"), l, destinataire);
      expect(r.ok, `destinataire ${destinataire}`).toBe(false);
    }
    expect((await leadDe(idA, l)).assigneAId).toBe(adminA);
  });

  test("on ne transfère ni un prospect à celui qui le suit déjà, ni un prospect devenu client", async () => {
    const l = await creerLead(idA, adminA);
    expect((await transferer(idA, qui(idA, adminA, "ADMIN"), l, adminA)).ok).toBe(false);
    const client = await creerLead(idA, adminA, { convertiLe: new Date() });
    expect((await transferer(idA, qui(idA, adminA, "ADMIN"), client, employeA)).ok).toBe(false);
  });

  test("se confier le prospect à soi-même ne prépare aucun courrier", async () => {
    const l = await creerLead(idA, employeA);
    const r = await transferer(idA, qui(idA, adminA, "ADMIN"), l, adminA);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.email).toBeNull();
    expect((await leadDe(idA, l)).assigneAId).toBe(adminA);
  });

  test("FUITE ENTRE ENTREPRISES : l'Administrateur d'une autre entreprise ne peut ni voir ni transférer ce prospect", async () => {
    const l = await creerLead(idA, adminA);
    const r = await transferer(idB, qui(idB, adminB, "ADMIN"), l, adminB);
    expect(r.ok).toBe(false);
    const apres = await leadDe(idA, l);
    expect(apres.assigneAId).toBe(adminA);
    expect(await notesDe(idA, l)).toHaveLength(0);
  });

  test("la liste des collègues : actifs, avec accès au CRM, de l'entreprise seulement ; vide pour un Employé", async () => {
    const liste = await avecEntreprise(idA, (tx) => collaborateursPourTransfert(tx, qui(idA, adminA, "ADMIN")));
    const ids = liste.map((c) => c.id);
    expect(ids).toEqual(expect.arrayContaining([adminA, managerA, employeA]));
    expect(ids).not.toContain(employeInactif);
    expect(ids).not.toContain(employeSansCrm);
    expect(ids).not.toContain(adminB);
    expect(await avecEntreprise(idA, (tx) => collaborateursPourTransfert(tx, qui(idA, employeA, "EMPLOYE")))).toEqual([]);
  });
});
