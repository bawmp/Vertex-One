import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { eq } from "drizzle-orm";
import { avecEntreprise, db } from "@/db/client";
import { dossierRH, entreprise, paiementSalaire, prime, utilisateur } from "@/db/schema";
import { calculerBulletin, jourValide, lireRetenues, moisValide, referenceBulletin } from "@/lib/rh/paie-regles";
import { lireBulletin, paiementsDuDossier, primesDuDossier } from "@/lib/rh/paie";
import { supprimerEntrepriseDeTest } from "./aide-nettoyage";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (u: string) => { throw new Error(`REDIRECT ${u}`); } }));
vi.mock("@/lib/i18n/langue", () => ({ getT: async () => Object.assign((texte: string, v?: Record<string, string | number>) => (v ? texte.replace(/\{(\w+)\}/g, (b, k: string) => String(v[k] ?? b)) : texte), { locale: "fr-FR" }) }));
let connecte: { utilisateurId: string; entrepriseId: string; role: string } | null = null;
vi.mock("@/lib/session", () => ({ recupererUtilisateurConnecte: async () => connecte }));

// Aucun vrai envoi, et les tâches `after()` sont lancées aussitôt.
const envoyerEmail = vi.hoisted(() => vi.fn(async (_p: { to: string; subject: string; attachments?: { filename: string; content: Buffer }[] }) => ({ envoye: true })));
vi.mock("@/lib/email/client", () => ({ envoyerEmail }));
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: (f: () => unknown) => { void f(); } }));

const { ajouterPrime, payerSalaire, supprimerPrime, modifierBulletin, envoyerBulletin } = await import("@/lib/actions/paie");

describe("Paie simple — règles pures", () => {
  test("mois et jours valides", () => {
    expect(moisValide("2026-11")).toBe(true);
    expect(moisValide("2026-13")).toBe(false);
    expect(moisValide("2026-1")).toBe(false);
    expect(jourValide("2026-02-29")).toBe(false);
    expect(jourValide("2028-02-29")).toBe(true);
  });

  test("net = salaire + primes − retenues, jamais de retenue au-delà de ce qui est dû", () => {
    expect(calculerBulletin(300_000, [20_000, 5_000], [{ libelle: "Avance", montant: 50_000 }])).toEqual({ totalPrimes: 25_000, totalRetenues: 50_000, brut: 325_000, net: 275_000 });
    expect(calculerBulletin(100_000, [], [{ libelle: "Trop", montant: 100_001 }]).net).toBeNull();
    expect(calculerBulletin(100_000, [], []).net).toBe(100_000);
  });

  test("lecture des retenues : lignes vides ignorées, nom et montant obligatoires ensemble", () => {
    const champs = (o: Record<string, string>) => (nom: string) => o[nom] ?? "";
    expect(lireRetenues(champs({ retenueLibelle1: "Avance", retenueMontant1: "25 000" })).retenues).toEqual([{ libelle: "Avance", montant: 25_000 }]);
    expect(lireRetenues(champs({})).retenues).toEqual([]);
    expect(lireRetenues(champs({ retenueMontant1: "100" })).erreur).toBeTruthy();
    expect(lireRetenues(champs({ retenueLibelle1: "X", retenueMontant1: "-5" })).erreur).toBeTruthy();
    expect(lireRetenues(champs({ retenueLibelle1: "X", retenueMontant1: "1.5" })).erreur).toBeTruthy();
  });

  test("référence stable", () => {
    expect(referenceBulletin("2026-11", "abcdef123456")).toBe("BP-2026-11-123456");
  });
});

describe("Primes et bulletins — base réelle", () => {
  const suffixe = Math.random().toString(36).slice(2, 8);
  const nomA = `TEST Paie A ${suffixe}`;
  const nomB = `TEST Paie B ${suffixe}`;
  let idA = "", idB = "", adminA = "", empA = "", adminB = "", dossierEmpA = "", dossierSansSalaire = "", dossierB = "";

  beforeAll(async () => {
    const [a] = await db.insert(entreprise).values({ nom: nomA, secteurProfil: "agence" }).returning({ id: entreprise.id });
    const [b] = await db.insert(entreprise).values({ nom: nomB, secteurProfil: "agence" }).returning({ id: entreprise.id });
    idA = a.id;
    idB = b.id;
    const crees = await db
      .insert(utilisateur)
      .values([
        { entrepriseId: idA, email: `admin-a-${suffixe}@vertexone.test`, nomComplet: "Admin A", role: "ADMIN", statut: "ACTIF" },
        { entrepriseId: idA, email: `emp-a-${suffixe}@vertexone.test`, nomComplet: "Employé A", role: "EMPLOYE", statut: "ACTIF" },
        { entrepriseId: idA, email: `sans-a-${suffixe}@vertexone.test`, nomComplet: "Sans Salaire", role: "EMPLOYE", statut: "ACTIF" },
        { entrepriseId: idB, email: `admin-b-${suffixe}@vertexone.test`, nomComplet: "Admin B", role: "ADMIN", statut: "ACTIF" },
      ])
      .returning({ id: utilisateur.id, email: utilisateur.email });
    const par = (debut: string) => crees.find((u) => u.email.startsWith(debut))!.id;
    adminA = par("admin-a");
    empA = par("emp-a");
    adminB = par("admin-b");
    const sansA = par("sans-a");
    const creerDossier = (entrepriseId: string, utilisateurId: string, salaireBase: number | null) =>
      avecEntreprise(entrepriseId, async (tx) => {
        const [d] = await tx.insert(dossierRH).values({ entrepriseId, utilisateurId, poste: "Poste", typeContrat: "CDI", dateEmbauche: new Date("2025-01-01"), salaireBase }).returning({ id: dossierRH.id });
        return d.id;
      });
    dossierEmpA = await creerDossier(idA, empA, 300_000);
    dossierSansSalaire = await creerDossier(idA, sansA, null);
    dossierB = await creerDossier(idB, adminB, 400_000);
  }, 120_000);

  afterAll(async () => {
    await supprimerEntrepriseDeTest(nomA);
    await supprimerEntrepriseDeTest(nomB);
  }, 180_000);

  beforeEach(() => {
    connecte = { utilisateurId: adminA, entrepriseId: idA, role: "ADMIN" };
  });

  const formPrime = (dossierRHId: string, montant: string, mois = "2026-10", type = "RENDEMENT") => {
    const f = new FormData();
    f.set("dossierRHId", dossierRHId);
    f.set("type", type);
    f.set("montant", montant);
    f.set("moisConcerne", mois);
    f.set("motif", "Objectifs atteints");
    return f;
  };
  const formPaiement = (dossierRHId: string, mois: string, extra: Record<string, string> = {}) => {
    const f = new FormData();
    f.set("dossierRHId", dossierRHId);
    f.set("mois", mois);
    f.set("datePaiement", "2026-11-05");
    f.set("modePaiement", "MOBILE_MONEY");
    for (const [k, v] of Object.entries(extra)) f.set(k, v);
    return f;
  };

  test("une prime se rejette si elle est mal formée, ou venue d'un autre rôle que l'Administrateur", async () => {
    expect(await ajouterPrime(null, formPrime(dossierEmpA, "-5"))).toMatchObject({ erreur: expect.any(String) });
    expect(await ajouterPrime(null, formPrime(dossierEmpA, "1000", "2026-13"))).toMatchObject({ erreur: expect.any(String) });
    expect(await ajouterPrime(null, formPrime(dossierEmpA, "1000", "2026-10", "INVENTE"))).toMatchObject({ erreur: expect.any(String) });
    connecte = { utilisateurId: empA, entrepriseId: idA, role: "EMPLOYE" };
    expect(await ajouterPrime(null, formPrime(dossierEmpA, "50000"))).toEqual({ erreur: "Seul l'Administrateur peut accorder une prime." });
  }, 60_000);

  test("le bulletin reprend salaire + primes en attente − retenues, rattache les primes et ne se refait pas pour le même mois", async () => {
    expect(await ajouterPrime(null, formPrime(dossierEmpA, "20000", "2026-10"))).toEqual({ ok: true });
    expect(await ajouterPrime(null, formPrime(dossierEmpA, "5000", "2026-11", "TRANSPORT"))).toEqual({ ok: true });
    // Une prime d'un mois FUTUR (décembre) ne doit pas entrer dans le bulletin de novembre.
    expect(await ajouterPrime(null, formPrime(dossierEmpA, "99000", "2026-12", "EXCEPTIONNELLE"))).toEqual({ ok: true });

    const r = await payerSalaire(null, formPaiement(dossierEmpA, "2026-11", { retenueLibelle1: "Avance sur salaire", retenueMontant1: "50000" }));
    expect(r).toMatchObject({ ok: true, paiementId: expect.any(String) });

    // Brouillon : rien n'est envoyé à la personne tant que l'Administrateur ne l'a pas décidé.
    expect(envoyerEmail).not.toHaveBeenCalled();

    const [p] = await avecEntreprise(idA, (tx) => tx.select().from(paiementSalaire).where(eq(paiementSalaire.dossierRHId, dossierEmpA)));
    expect(p).toMatchObject({ mois: "2026-11", salaireBase: 300_000, totalPrimes: 25_000, totalRetenues: 50_000, net: 275_000, modePaiement: "MOBILE_MONEY", datePaiement: "2026-11-05" });
    expect(p.primes.map((x) => x.montant).sort()).toEqual([20_000, 5_000]);
    expect(p.retenues).toEqual([{ libelle: "Avance sur salaire", montant: 50_000 }]);

    const primes = await avecEntreprise(idA, (tx) => primesDuDossier(tx, dossierEmpA));
    expect(primes.filter((x) => x.paiementSalaireId === p.id)).toHaveLength(2);
    expect(primes.find((x) => x.montant === 99_000)?.paiementSalaireId).toBeNull();

    // Même mois une seconde fois : refusé, rien ne change.
    expect(await payerSalaire(null, formPaiement(dossierEmpA, "2026-11"))).toEqual({ erreur: "Le salaire de ce mois est déjà payé : son bulletin existe." });
    expect(await avecEntreprise(idA, (tx) => paiementsDuDossier(tx, dossierEmpA))).toHaveLength(1);

    // Une prime déjà payée ne se supprime plus ; une prime en attente, si.
    const payee = primes.find((x) => x.paiementSalaireId)!;
    const attente = primes.find((x) => x.montant === 99_000)!;
    const f1 = new FormData(); f1.set("id", payee.id);
    const f2 = new FormData(); f2.set("id", attente.id);
    await supprimerPrime(f1);
    await supprimerPrime(f2);
    const apres = await avecEntreprise(idA, (tx) => tx.select().from(prime).where(eq(prime.dossierRHId, dossierEmpA)));
    expect(apres.some((x) => x.id === payee.id)).toBe(true);
    expect(apres.some((x) => x.id === attente.id)).toBe(false);
  }, 120_000);

  test("le bulletin est un brouillon modifiable, caché de la personne, puis envoyé et figé", async () => {
    const [p] = await avecEntreprise(idA, (tx) => tx.select().from(paiementSalaire).where(eq(paiementSalaire.dossierRHId, dossierEmpA)));
    expect(p.envoyeLe).toBeNull();

    // La personne ne voit pas le brouillon (liste) ; l'Administrateur, si.
    expect(await avecEntreprise(idA, (tx) => paiementsDuDossier(tx, dossierEmpA, { seulementEnvoyes: true }))).toHaveLength(0);
    expect(await avecEntreprise(idA, (tx) => paiementsDuDossier(tx, dossierEmpA))).toHaveLength(1);

    // Correction : le net est recalculé depuis le salaire et les primes figés ; des retenues trop fortes sont refusées.
    const f = new FormData();
    f.set("paiementId", p.id);
    f.set("datePaiement", "2026-11-07");
    f.set("modePaiement", "VIREMENT");
    f.set("retenueLibelle1", "Avance");
    f.set("retenueMontant1", "10000");
    expect(await modifierBulletin(null, f)).toEqual({ ok: true });
    const [corrige] = await avecEntreprise(idA, (tx) => tx.select().from(paiementSalaire).where(eq(paiementSalaire.id, p.id)));
    expect(corrige).toMatchObject({ datePaiement: "2026-11-07", modePaiement: "VIREMENT", totalRetenues: 10_000, net: 315_000 });
    f.set("retenueMontant1", "9999999");
    expect(await modifierBulletin(null, f)).toEqual({ erreur: "Les retenues dépassent le salaire et les primes du mois." });

    // Seul l'Administrateur modifie ou envoie.
    connecte = { utilisateurId: empA, entrepriseId: idA, role: "EMPLOYE" };
    expect(await modifierBulletin(null, f)).toEqual({ erreur: "Seul l'Administrateur peut modifier un bulletin." });
    const g = new FormData(); g.set("paiementId", p.id);
    expect(await envoyerBulletin(null, g)).toEqual({ erreur: "Seul l'Administrateur peut envoyer un bulletin." });
    expect(envoyerEmail).not.toHaveBeenCalled();

    // Envoi : l'email part avec le PDF, le bulletin devient visible de la personne et figé.
    connecte = { utilisateurId: adminA, entrepriseId: idA, role: "ADMIN" };
    expect(await envoyerBulletin(null, g)).toEqual({ ok: true });
    await vi.waitFor(() => expect(envoyerEmail).toHaveBeenCalledTimes(1), { timeout: 30_000 });
    const mail = envoyerEmail.mock.calls[0][0];
    expect(mail.to).toBe(`emp-a-${suffixe}@vertexone.test`);
    expect(mail.attachments?.[0].filename).toBe("bulletin-2026-11.pdf");
    expect(mail.attachments?.[0].content.subarray(0, 4).toString()).toBe("%PDF");
    expect(await avecEntreprise(idA, (tx) => paiementsDuDossier(tx, dossierEmpA, { seulementEnvoyes: true }))).toHaveLength(1);
    const [envoye] = await avecEntreprise(idA, (tx) => tx.select().from(paiementSalaire).where(eq(paiementSalaire.id, p.id)));
    expect(envoye.envoyeLe).not.toBeNull();
    expect(await modifierBulletin(null, f)).toEqual({ erreur: "Ce bulletin a déjà été envoyé : il ne peut plus être modifié." });

    // Autre espace : ni modification ni envoi.
    connecte = { utilisateurId: adminB, entrepriseId: idB, role: "ADMIN" };
    expect(await envoyerBulletin(null, g)).toEqual({ erreur: "Bulletin introuvable." });
  }, 120_000);

  test("retenues supérieures au dû, ou salaire non renseigné : aucun paiement n'est enregistré", async () => {
    const trop = await payerSalaire(null, formPaiement(dossierEmpA, "2026-09", { retenueLibelle1: "Énorme", retenueMontant1: "9999999" }));
    expect(trop).toEqual({ erreur: "Les retenues dépassent le salaire et les primes du mois." });
    const sans = await payerSalaire(null, formPaiement(dossierSansSalaire, "2026-11"));
    expect(sans).toEqual({ erreur: "Renseignez d'abord le salaire de base de cette personne." });
    const tout = await avecEntreprise(idA, (tx) => tx.select().from(paiementSalaire));
    expect(tout.filter((x) => x.mois === "2026-09" || x.dossierRHId === dossierSansSalaire)).toHaveLength(0);
  }, 60_000);

  test("seul l'Administrateur enregistre un paiement ; le Manager et l'Employé sont refusés", async () => {
    for (const role of ["MANAGER", "EMPLOYE", "COMPTABLE"]) {
      connecte = { utilisateurId: empA, entrepriseId: idA, role };
      expect(await payerSalaire(null, formPaiement(dossierEmpA, "2026-08"))).toEqual({ erreur: "Seul l'Administrateur peut enregistrer un paiement de salaire." });
    }
    expect((await avecEntreprise(idA, (tx) => tx.select().from(paiementSalaire))).some((x) => x.mois === "2026-08")).toBe(false);
  }, 60_000);

  test("un autre espace ne voit ni ne paie ni ne lit rien de cette entreprise (fuite délibérée)", async () => {
    const [existant] = await avecEntreprise(idA, (tx) => tx.select({ id: paiementSalaire.id }).from(paiementSalaire).where(eq(paiementSalaire.dossierRHId, dossierEmpA)));

    // Lecture directe sous l'entreprise B : la RLS ne renvoie rien.
    expect(await avecEntreprise(idB, (tx) => tx.select().from(paiementSalaire).where(eq(paiementSalaire.dossierRHId, dossierEmpA)))).toEqual([]);
    expect(await avecEntreprise(idB, (tx) => tx.select().from(prime).where(eq(prime.dossierRHId, dossierEmpA)))).toEqual([]);
    expect(await avecEntreprise(idB, (tx) => lireBulletin(tx, dossierEmpA, existant.id))).toBeNull();

    // L'Administrateur de B ne peut ni accorder une prime ni payer un salaire sur le dossier de A.
    connecte = { utilisateurId: adminB, entrepriseId: idB, role: "ADMIN" };
    expect(await ajouterPrime(null, formPrime(dossierEmpA, "1000"))).toEqual({ erreur: "Dossier RH introuvable." });
    expect(await payerSalaire(null, formPaiement(dossierEmpA, "2026-07"))).toEqual({ erreur: "Dossier RH introuvable." });

    // Et un bulletin lu avec un mauvais dossier ne sort pas, même dans la bonne entreprise.
    expect(await avecEntreprise(idA, (tx) => lireBulletin(tx, dossierSansSalaire, existant.id))).toBeNull();
    expect(await avecEntreprise(idA, (tx) => lireBulletin(tx, dossierEmpA, existant.id))).toMatchObject({ nomComplet: "Employé A" });
    expect(dossierB).toBeTruthy();
  }, 90_000);
});
