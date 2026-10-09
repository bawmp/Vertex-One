import { describe, test, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, utilisateur, lead, cleApiEntreprise, contactChampPersonnalise } from "@/db/schema";
import { empreinteCle, formeCleValide, genererCle, lireCleDepuisEnTete } from "@/lib/api-externe/cle";
import { reinitialiserLimites, autoriserAppel } from "@/lib/api-externe/limite";
import { semerChampsDuProfil, CHAMPS_CONTACT_IMMIGRATION } from "@/lib/profils/immigration";
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

describe("Clés d'API — utilitaires", () => {
  test("une clé générée a la forme attendue, une empreinte stable, et deux clés ne sont jamais identiques", () => {
    const a = genererCle();
    const b = genererCle();
    expect(formeCleValide(a.cle)).toBe(true);
    expect(a.cle).toMatch(/^vo_/);
    expect(a.cle).not.toBe(b.cle);
    expect(a.empreinte).toBe(empreinteCle(a.cle));
    expect(a.empreinte).toMatch(/^[0-9a-f]{64}$/);
    expect(a.prefixe).toBe(a.cle.slice(0, 10));
    expect(a.prefixe).not.toBe(a.cle); // jamais la clé entière
  });

  test("seule une clé bien formée est acceptée", () => {
    expect(formeCleValide("vo_court")).toBe(false);
    expect(formeCleValide("x".repeat(46))).toBe(false);
    expect(formeCleValide(`vo_${"a".repeat(44)}`)).toBe(false);
    expect(formeCleValide(`vo_${"a".repeat(43)}`)).toBe(true);
  });

  test("lecture de l'en-tête Authorization", () => {
    expect(lireCleDepuisEnTete("Bearer vo_abc")).toBe("vo_abc");
    expect(lireCleDepuisEnTete("bearer   vo_abc")).toBe("vo_abc");
    expect(lireCleDepuisEnTete("Basic abc")).toBeNull();
    expect(lireCleDepuisEnTete("Bearer")).toBeNull();
    expect(lireCleDepuisEnTete(null)).toBeNull();
  });
});

describe("POST /api/externe/leads — base réelle", () => {
  const suffixe = Math.random().toString(36).slice(2, 8);
  const nomA = `TEST ApiExterne A ${suffixe}`;
  const nomB = `TEST ApiExterne B ${suffixe}`;
  let entrepriseA: string;
  let entrepriseB: string;
  let adminA: string;
  let cleA = "";
  let cleB = "";
  let cleRevoquee = "";
  let idCleA = "";

  const appel = (corps: unknown, cle: string | null = cleA, entetes: Record<string, string> = {}) =>
    POST(
      new Request("https://vertexone.test/api/externe/leads", {
        method: "POST",
        headers: { "content-type": "application/json", ...(cle ? { authorization: `Bearer ${cle}` } : {}), ...entetes },
        body: typeof corps === "string" ? corps : JSON.stringify(corps),
      })
    );

  beforeAll(async () => {
    const [a] = await db.insert(entreprise).values({ nom: nomA, secteurProfil: "immigration" }).returning({ id: entreprise.id });
    const [b] = await db.insert(entreprise).values({ nom: nomB, secteurProfil: "agence" }).returning({ id: entreprise.id });
    entrepriseA = a.id;
    entrepriseB = b.id;
    const [ua] = await db.insert(utilisateur).values({ entrepriseId: entrepriseA, email: `admin-api-a-${suffixe}@vertexone.test`, nomComplet: "Admin A", role: "ADMIN" }).returning({ id: utilisateur.id });
    const [ub] = await db.insert(utilisateur).values({ entrepriseId: entrepriseB, email: `admin-api-b-${suffixe}@vertexone.test`, nomComplet: "Admin B", role: "ADMIN" }).returning({ id: utilisateur.id });
    adminA = ua.id;

    const creerCle = async (entrepriseId: string, auteur: string, nom: string, revoquee = false) => {
      const k = genererCle();
      const [ligne] = await avecEntreprise(entrepriseId, (tx) =>
        tx.insert(cleApiEntreprise).values({ entrepriseId, nom, prefixe: k.prefixe, empreinte: k.empreinte, creeParId: auteur, revoqueeLe: revoquee ? new Date() : null }).returning({ id: cleApiEntreprise.id })
      );
      return { cle: k.cle, id: ligne.id };
    };
    const ka = await creerCle(entrepriseA, adminA, "Site A");
    cleA = ka.cle;
    idCleA = ka.id;
    cleB = (await creerCle(entrepriseB, ub.id, "Site B")).cle;
    cleRevoquee = (await creerCle(entrepriseA, adminA, "Ancienne clé", true)).cle;
  }, 90_000);

  afterAll(async () => {
    await supprimerEntrepriseDeTest(nomA);
    await supprimerEntrepriseDeTest(nomB);
  }, 90_000);

  beforeEach(() => {
    reinitialiserLimites();
    envoyerEmail.mockClear();
  });

  const leadsDe = (entrepriseId: string) => avecEntreprise(entrepriseId, (tx) => tx.select().from(lead).where(eq(lead.entrepriseId, entrepriseId)));

  test("sans clé, avec une clé mal formée, inconnue ou révoquée : toujours la même réponse 401", async () => {
    const inconnue = genererCle().cle;
    for (const cle of [null, "vo_court", inconnue, cleRevoquee]) {
      const r = await appel({ nom: "Jean Mbarga" }, cle);
      expect(r.status, String(cle)).toBe(401);
      expect(await r.json()).toEqual({ erreur: "Clé d'API invalide." });
    }
    expect(await leadsDe(entrepriseA)).toHaveLength(0);
  });

  test("une demande valide crée un lead assigné à l'administrateur, avec sa source, et alerte l'administrateur", async () => {
    const r = await appel({ nom: "Jean Mbarga", telephone: "+237690111222", email: "jean@exemple.test", message: "Visa étudiant Canada", source: "Site Global Mobility", reference: "demande-1" });
    expect(r.status).toBe(201);
    const { id, doublon } = await r.json();
    expect(doublon).toBe(false);

    const [cree] = (await leadsDe(entrepriseA)).filter((l) => l.id === id);
    expect(cree.nom).toBe("Jean Mbarga");
    expect(cree.telephone).toBe("+237690111222");
    expect(cree.statut).toBe("NOUVEAU");
    expect(cree.assigneAId).toBe(adminA);
    expect(cree.sourceExterne).toBe("Site Global Mobility");
    expect(cree.notes).toContain("Visa étudiant Canada");

    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(envoyerEmail).toHaveBeenCalledTimes(1);
    expect(envoyerEmail.mock.calls[0]).toEqual([expect.objectContaining({ to: `admin-api-a-${suffixe}@vertexone.test` })]);

    const [cle] = await avecEntreprise(entrepriseA, (tx) => tx.select().from(cleApiEntreprise).where(eq(cleApiEntreprise.id, idCleA)));
    expect(cle.dernierUsageLe).not.toBeNull();
  });

  test("renvoyer la même référence ne crée jamais un second lead", async () => {
    const corps = { nom: "Marie Tchoua", telephone: "+237690333444", reference: "demande-doublon", source: "Site Global Mobility" };
    const premier = await (await appel(corps)).json();
    const deuxieme = await appel(corps);
    expect(deuxieme.status).toBe(200);
    expect(await deuxieme.json()).toEqual({ id: premier.id, doublon: true });
    const marie = (await leadsDe(entrepriseA)).filter((l) => l.nom === "Marie Tchoua");
    expect(marie).toHaveLength(1);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(envoyerEmail).toHaveBeenCalledTimes(1); // pas de seconde alerte pour un doublon
  });

  test("l'entreprise est toujours celle de la clé : un entrepriseId glissé dans le corps est ignoré", async () => {
    const r = await appel({ nom: "Pirate", telephone: "+237600000000", entrepriseId: entrepriseA }, cleB);
    expect(r.status).toBe(201);
    expect((await leadsDe(entrepriseB)).map((l) => l.nom)).toContain("Pirate");
    expect((await leadsDe(entrepriseA)).map((l) => l.nom)).not.toContain("Pirate");
  });

  test("un téléphone absent devient « Non renseigné », jamais un refus", async () => {
    const r = await appel({ nom: "Sans Téléphone", email: "sans@exemple.test" });
    expect(r.status).toBe(201);
    const [l] = (await leadsDe(entrepriseA)).filter((x) => x.nom === "Sans Téléphone");
    expect(l.telephone).toBe("Non renseigné");
  });

  test("données invalides : 400 avec la raison ; JSON cassé : 400 ; corps énorme : 413", async () => {
    expect((await appel({ telephone: "+237690000000" })).status).toBe(400);
    expect((await appel({ nom: "X" })).status).toBe(400);
    expect((await appel({ nom: "Jean", email: "pas-un-email" })).status).toBe(400);
    expect((await appel("{ pas du json")).status).toBe(400);
    expect((await appel({ nom: "Jean", message: "x".repeat(5000) })).status).toBe(400);
    expect((await appel({ nom: "Jean" }, cleA, { "content-length": "999999" })).status).toBe(413);
    expect((await appel("x".repeat(25_000))).status).toBe(413);
  });

  test("le message d'un visiteur est échappé dans l'email d'alerte", async () => {
    await appel({ nom: "<b>Gras</b>", message: '<img src=x onerror="alert(1)">', reference: "demande-xss" });
    await new Promise((resolve) => setTimeout(resolve, 100));
    const html = envoyerEmail.mock.calls[0][0].html;
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<b>Gras");
    expect(html).toContain("&lt;img");
  });

  test("au-delà de 30 appels par minute et par clé : 429 ; une autre clé n'est pas touchée", async () => {
    // On remplit directement le compteur de la clé A (30 appels déjà faits) au lieu de 31 allers-retours vers la base.
    for (let i = 0; i < 30; i++) expect(autoriserAppel(idCleA)).toBe(true);
    expect(autoriserAppel(idCleA)).toBe(false);

    const r = await appel({ nom: "Rafale" });
    expect(r.status).toBe(429);
    expect((await leadsDe(entrepriseA)).map((l) => l.nom)).not.toContain("Rafale");

    expect((await appel({ nom: "Autre clé" }, cleB)).status).toBe(201);
  });

  test("fuite : l'entreprise B ne voit ni les clés ni les leads de l'entreprise A ; sa clé ne peut pas écrire chez A", async () => {
    const clesVuesParB = await avecEntreprise(entrepriseB, (tx) => tx.select({ id: cleApiEntreprise.id }).from(cleApiEntreprise).where(eq(cleApiEntreprise.entrepriseId, entrepriseA)));
    expect(clesVuesParB).toHaveLength(0);
    const leadsVusParB = await avecEntreprise(entrepriseB, (tx) => tx.select({ id: lead.id }).from(lead).where(eq(lead.entrepriseId, entrepriseA)));
    expect(leadsVusParB).toHaveLength(0);
    await expect(
      avecEntreprise(entrepriseB, (tx) => tx.insert(cleApiEntreprise).values({ entrepriseId: entrepriseA, nom: "Volée", prefixe: "vo_xxxxxxx", empreinte: empreinteCle(`vol-${suffixe}`), creeParId: adminA }))
    ).rejects.toThrow();
  });

  test("la lecture anonyme retrouve une clé par son empreinte, et une clé révoquée est reconnue comme telle", async () => {
    const [anonyme] = await db.select().from(cleApiEntreprise).where(eq(cleApiEntreprise.empreinte, empreinteCle(cleRevoquee)));
    expect(anonyme.revoqueeLe).not.toBeNull();
    expect(anonyme.entrepriseId).toBe(entrepriseA);
  });

  test("profil immigration : les champs de départ sont semés une seule fois, et jamais pour un autre profil", async () => {
    expect(await avecEntreprise(entrepriseA, (tx) => semerChampsDuProfil(tx, entrepriseA, "immigration"))).toBe(CHAMPS_CONTACT_IMMIGRATION.length);
    expect(await avecEntreprise(entrepriseA, (tx) => semerChampsDuProfil(tx, entrepriseA, "immigration"))).toBe(0);
    expect(await avecEntreprise(entrepriseB, (tx) => semerChampsDuProfil(tx, entrepriseB, "cabinet"))).toBe(0);

    const champs = await avecEntreprise(entrepriseA, (tx) => tx.select().from(contactChampPersonnalise).where(and(eq(contactChampPersonnalise.entrepriseId, entrepriseA))));
    expect(champs.map((c) => c.libelle).sort()).toEqual(CHAMPS_CONTACT_IMMIGRATION.map((c) => c.libelle).sort());
    expect(champs.some((c) => /passeport/i.test(c.libelle))).toBe(false); // jamais de donnée d'identité en champ libre
  });
});
