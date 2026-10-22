import { describe, test, expect, beforeAll, afterAll, vi } from "vitest";
import { eq } from "drizzle-orm";

vi.mock("server-only", () => ({}));

import { db, avecEntreprise } from "@/db/client";
import { entreprise, utilisateur, contact, emailEnvoye } from "@/db/schema";
import { journaliserEmailEnvoye, resumePiecesJointes } from "@/lib/crm/journaliser-email";
import { listerSouche, lireSouche } from "@/lib/email/souche";
import type { UtilisateurConnecte } from "@/lib/session";
import { supprimerEntrepriseDeTest } from "./aide-nettoyage";

/**
 * Souche des emails envoyés : chaque envoi est conservé tel quel ; l'Administrateur voit tous ceux de son entreprise, un
 * Employé seulement les siens ; une autre entreprise n'en voit aucun et ne peut rien y écrire (RLS).
 */
const suffixe = Math.random().toString(36).slice(2, 8);
const nomA = `TEST Souche A ${suffixe}`;
const nomB = `TEST Souche B ${suffixe}`;
let a = "", b = "", adminA = "", employeA = "", adminB = "", contactA = "";
let idEnvoiEmploye = "", idEnvoiAuto = "";

const moi = (entrepriseId: string, utilisateurId: string, role: "ADMIN" | "EMPLOYE") => ({ entrepriseId, utilisateurId, role }) as UtilisateurConnecte;

beforeAll(async () => {
  [{ id: a }] = await db.insert(entreprise).values({ nom: nomA, secteurProfil: "generique" }).returning({ id: entreprise.id });
  [{ id: b }] = await db.insert(entreprise).values({ nom: nomB, secteurProfil: "generique" }).returning({ id: entreprise.id });
  const creer = async (entrepriseId: string, prefixe: string, role: "ADMIN" | "EMPLOYE") =>
    (await db.insert(utilisateur).values({ entrepriseId, email: `${prefixe}-${suffixe}@vertexone.test`, nomComplet: prefixe, role }).returning({ id: utilisateur.id }))[0].id;
  adminA = await creer(a, "admin-a", "ADMIN");
  employeA = await creer(a, "employe-a", "EMPLOYE");
  adminB = await creer(b, "admin-b", "ADMIN");
  [{ id: contactA }] = await avecEntreprise(a, (tx) => tx.insert(contact).values({ entrepriseId: a, nom: "Client A", telephone: "690000000", assigneAId: adminA }).returning({ id: contact.id }));

  await avecEntreprise(a, async (tx) => {
    await journaliserEmailEnvoye(tx, { entrepriseId: a, contactId: contactA, auteurId: adminA, sujet: "Devis admin", souche: { destinataire: "client@exemple.test", html: "<p>Bonjour</p>", piecesJointes: resumePiecesJointes([{ filename: "DEV-1.pdf", content: Buffer.from("pdf") }]), type: "DEVIS" } });
    await journaliserEmailEnvoye(tx, { entrepriseId: a, contactId: contactA, auteurId: employeA, sujet: "Facture employé", souche: { destinataire: "client@exemple.test", html: "<p>Facture</p>", type: "FACTURE" } });
    await journaliserEmailEnvoye(tx, { entrepriseId: a, contactId: contactA, auteurId: null, sujet: "Relance auto", souche: { destinataire: "client@exemple.test", html: "<p>Relance</p>", type: "RELANCE" } });
  });
  const lignes = await avecEntreprise(a, (tx) => tx.select({ id: emailEnvoye.id, sujet: emailEnvoye.sujet }).from(emailEnvoye).where(eq(emailEnvoye.entrepriseId, a)));
  idEnvoiEmploye = lignes.find((l) => l.sujet === "Facture employé")!.id;
  idEnvoiAuto = lignes.find((l) => l.sujet === "Relance auto")!.id;
}, 120_000);

afterAll(async () => {
  await supprimerEntrepriseDeTest(nomA);
  await supprimerEntrepriseDeTest(nomB);
}, 120_000);

describe("Souche des emails envoyés", () => {
  test("la copie complète est conservée (destinataire, corps, pièces jointes, type)", async () => {
    const liste = await avecEntreprise(a, (tx) => listerSouche(tx, moi(a, adminA, "ADMIN"), { limite: 50 }));
    const devis = liste.find((l) => l.sujet === "Devis admin")!;
    expect(devis).toMatchObject({ destinataire: "client@exemple.test", type: "DEVIS", nbPiecesJointes: 1 });
    const detail = await avecEntreprise(a, (tx) => lireSouche(tx, moi(a, adminA, "ADMIN"), devis.id));
    expect(detail?.corpsHtml).toBe("<p>Bonjour</p>");
    expect(detail?.piecesJointes).toEqual([{ nom: "DEV-1.pdf", taille: 3 }]);
  });

  test("l'Administrateur voit tout, l'Employé seulement ses propres envois", async () => {
    const admin = await avecEntreprise(a, (tx) => listerSouche(tx, moi(a, adminA, "ADMIN"), { limite: 50 }));
    expect(admin.map((l) => l.sujet).sort()).toEqual(["Devis admin", "Facture employé", "Relance auto"]);
    const employe = await avecEntreprise(a, (tx) => listerSouche(tx, moi(a, employeA, "EMPLOYE"), { limite: 50 }));
    expect(employe.map((l) => l.sujet)).toEqual(["Facture employé"]);
    // ni l'envoi automatique, ni celui d'un collègue, même avec l'identifiant exact
    expect(await avecEntreprise(a, (tx) => lireSouche(tx, moi(a, employeA, "EMPLOYE"), idEnvoiAuto))).toBeNull();
    expect(await avecEntreprise(a, (tx) => lireSouche(tx, moi(a, adminA, "ADMIN"), idEnvoiEmploye))).not.toBeNull();
  });

  test("la recherche et le filtre par type fonctionnent, jokers neutralisés", async () => {
    const parType = await avecEntreprise(a, (tx) => listerSouche(tx, moi(a, adminA, "ADMIN"), { type: "RELANCE", limite: 50 }));
    expect(parType.map((l) => l.sujet)).toEqual(["Relance auto"]);
    const parMot = await avecEntreprise(a, (tx) => listerSouche(tx, moi(a, adminA, "ADMIN"), { recherche: "facture", limite: 50 }));
    expect(parMot.map((l) => l.sujet)).toEqual(["Facture employé"]);
    const joker = await avecEntreprise(a, (tx) => listerSouche(tx, moi(a, adminA, "ADMIN"), { recherche: "%", limite: 50 }));
    expect(joker).toHaveLength(0);
  });

  test("une autre entreprise n'en voit aucun, même avec un identifiant exact, et ne peut rien y écrire", async () => {
    expect(await avecEntreprise(b, (tx) => listerSouche(tx, moi(b, adminB, "ADMIN"), { limite: 50 }))).toHaveLength(0);
    expect(await avecEntreprise(b, (tx) => lireSouche(tx, moi(b, adminB, "ADMIN"), idEnvoiEmploye))).toBeNull();
    // RLS seule, sans le filtre du code : B ne lit ni n'insère rien au nom de A
    expect(await avecEntreprise(b, (tx) => tx.select().from(emailEnvoye))).toHaveLength(0);
    await expect(avecEntreprise(b, (tx) => tx.insert(emailEnvoye).values({ entrepriseId: a, destinataire: "x@y.test", sujet: "Intrus", corpsHtml: "<p>x</p>" }))).rejects.toThrow();
  });
});
