import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { eq } from "drizzle-orm";
import { avecEntreprise, db } from "@/db/client";
import { contact, emailEnvoye, entreprise, interaction, utilisateur } from "@/db/schema";
import { NB_MAX_PIECES_EMAIL, validerPiecesEmail } from "@/lib/email/pieces-jointes";
import { supprimerEntrepriseDeTest } from "./aide-nettoyage";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (u: string) => { throw new Error(`REDIRECT ${u}`); } }));
vi.mock("@/lib/i18n/langue", () => ({ getT: async () => Object.assign((texte: string, v?: Record<string, string | number>) => (v ? texte.replace(/\{(\w+)\}/g, (b, k: string) => String(v[k] ?? b)) : texte), { locale: "fr-FR" }) }));
let connecte: { utilisateurId: string; entrepriseId: string; role: string } | null = null;
vi.mock("@/lib/session", () => ({ recupererUtilisateurConnecte: async () => connecte }));
// Aucun vrai envoi : l'appel au prestataire est simulé et on garde ce qui lui aurait été remis.
const envoyerEmail = vi.fn(async (_p: { to: string; subject: string; html: string; attachments?: { filename: string; content: Buffer }[] }) => ({ envoye: true as const }));
vi.mock("@/lib/email/client", () => ({ envoyerEmail: (p: Parameters<typeof envoyerEmail>[0]) => envoyerEmail(p) }));

const { envoyerMessageClient } = await import("@/lib/actions/email-client");

// Contenus minimaux reconnus sur leurs octets.
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF");
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)]);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64)]);
const fichier = (contenu: Buffer, nom: string, type = "application/octet-stream") => new File([new Uint8Array(contenu)], nom, { type });

describe("Pièces jointes d'un email — validation", () => {
  test("aucun fichier, ou un champ fichier vide : rien à joindre", async () => {
    expect(await validerPiecesEmail([])).toEqual({ ok: true, pieces: [] });
    expect(await validerPiecesEmail([new File([], "")])).toEqual({ ok: true, pieces: [] });
    expect(await validerPiecesEmail(["texte"])).toEqual({ ok: true, pieces: [] });
  });

  test("PDF et images reconnus sur leurs octets, noms nettoyés et extension du vrai format", async () => {
    const r = await validerPiecesEmail([fichier(PDF, "../../devis.pdf"), fichier(PNG, "photo"), fichier(JPEG, "scan.jpeg"), fichier(PDF, "contrat.PDF")]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.pieces.map((p) => p.filename)).toEqual(["devis.pdf", "photo.png", "scan.jpeg", "contrat.PDF"]);
      expect(r.pieces[0].content.equals(PDF)).toBe(true);
    }
  });

  test("un fichier qui ne l'est pas vraiment est refusé, quel que soit son nom", async () => {
    const faux = await validerPiecesEmail([fichier(Buffer.from("MZ\x90\x00 programme.exe"), "facture.pdf", "application/pdf")]);
    expect(faux).toMatchObject({ ok: false, erreur: { cle: "« {nom} » : {raison}", valeurs: { nom: "facture.pdf" } } });
    // un seul fichier refusé : tout est refusé
    const mixte = await validerPiecesEmail([fichier(PDF, "bon.pdf"), fichier(Buffer.from("echo hello"), "script.sh")]);
    expect(mixte.ok).toBe(false);
  });

  test("trop de fichiers, ou plus de 4 Mo au total, sont refusés avant toute lecture", async () => {
    const six = Array.from({ length: NB_MAX_PIECES_EMAIL + 1 }, (_, i) => fichier(PDF, `p${i}.pdf`));
    expect(await validerPiecesEmail(six)).toMatchObject({ ok: false, erreur: { cle: "Un email accepte {n} pièces jointes au maximum.", valeurs: { n: NB_MAX_PIECES_EMAIL } } });

    const gros = Buffer.concat([PDF, Buffer.alloc(2.5 * 1024 * 1024)]);
    expect(await validerPiecesEmail([fichier(gros, "a.pdf"), fichier(gros, "b.pdf")])).toMatchObject({ ok: false, erreur: { cle: "Les pièces jointes dépassent {taille} au total ({envoyes} envoyés)." } });
  });
});

describe("Écrire à un client avec des pièces jointes — action complète (base réelle, envoi simulé)", () => {
  const suffixe = Math.random().toString(36).slice(2, 8);
  const nomA = `TEST PieceJointe A ${suffixe}`;
  const nomB = `TEST PieceJointe B ${suffixe}`;
  let idA = "", idB = "", adminA = "", adminB = "", contactA = "";

  beforeAll(async () => {
    const [a] = await db.insert(entreprise).values({ nom: nomA, secteurProfil: "agence" }).returning({ id: entreprise.id });
    const [b] = await db.insert(entreprise).values({ nom: nomB, secteurProfil: "agence" }).returning({ id: entreprise.id });
    idA = a.id;
    idB = b.id;
    const crees = await db
      .insert(utilisateur)
      .values([
        { entrepriseId: idA, email: `admin-a-${suffixe}@vertexone.test`, nomComplet: "Admin A", role: "ADMIN", statut: "ACTIF" },
        { entrepriseId: idB, email: `admin-b-${suffixe}@vertexone.test`, nomComplet: "Admin B", role: "ADMIN", statut: "ACTIF" },
      ])
      .returning({ id: utilisateur.id, email: utilisateur.email });
    adminA = crees.find((u) => u.email.startsWith("admin-a"))!.id;
    adminB = crees.find((u) => u.email.startsWith("admin-b"))!.id;
    contactA = await avecEntreprise(idA, async (tx) => {
      const [c] = await tx.insert(contact).values({ entrepriseId: idA, nom: "Linda Mbella", telephone: "690111222", email: "linda@exemple.test", assigneAId: adminA }).returning({ id: contact.id });
      return c.id;
    });
  }, 120_000);

  afterAll(async () => {
    await supprimerEntrepriseDeTest(nomA);
    await supprimerEntrepriseDeTest(nomB);
  }, 180_000);

  beforeEach(() => {
    envoyerEmail.mockClear();
    connecte = { utilisateurId: adminA, entrepriseId: idA, role: "ADMIN" };
  });

  const formulaire = (fichiers: File[] = [], contactId = contactA) => {
    const f = new FormData();
    f.set("contactId", contactId);
    f.set("objet", "Votre dossier");
    f.set("message", "Bonjour, voici les documents.");
    for (const x of fichiers) f.append("fichiers", x);
    return f;
  };
  const traces = () => avecEntreprise(idA, async (tx) => ({ interactions: await tx.select().from(interaction).where(eq(interaction.contactId, contactA)), souches: await tx.select().from(emailEnvoye).where(eq(emailEnvoye.contactId, contactA)) }));

  test("les fichiers partent avec l'email, et leurs noms restent dans l'historique et dans « Emails envoyés »", async () => {
    const r = await envoyerMessageClient(null, formulaire([fichier(PDF, "devis.pdf"), fichier(PNG, "plan.png")]));
    expect(r).toEqual({ envoye: true });

    expect(envoyerEmail).toHaveBeenCalledTimes(1);
    const appel = envoyerEmail.mock.calls[0][0];
    expect(appel.to).toBe("linda@exemple.test"); // l'adresse vient de la base, jamais du formulaire
    expect(appel.attachments?.map((p) => p.filename)).toEqual(["devis.pdf", "plan.png"]);
    expect(appel.attachments?.[0].content.equals(PDF)).toBe(true);

    const { interactions, souches } = await traces();
    expect(interactions.some((i) => i.contenu.includes("Pièces jointes : devis.pdf, plan.png"))).toBe(true);
    const souche = souches.find((s) => s.piecesJointes.length === 2)!;
    expect(souche).toMatchObject({ destinataire: "linda@exemple.test", sujet: "Votre dossier", type: "MESSAGE" });
    expect(souche.piecesJointes).toEqual([{ nom: "devis.pdf", taille: PDF.length }, { nom: "plan.png", taille: PNG.length }]);
  }, 90_000);

  test("sans fichier, l'email part comme avant (aucune pièce jointe)", async () => {
    const r = await envoyerMessageClient(null, formulaire());
    expect(r).toEqual({ envoye: true });
    expect(envoyerEmail.mock.calls[0][0].attachments).toBeUndefined();
  }, 60_000);

  test("un fichier refusé : rien ne part, rien n'est enregistré", async () => {
    const avant = await traces();
    const r = await envoyerMessageClient(null, formulaire([fichier(PDF, "ok.pdf"), fichier(Buffer.from("MZ\x90\x00 exe"), "facture.pdf", "application/pdf")]));
    expect(r).toMatchObject({ erreur: expect.stringContaining("facture.pdf") });
    expect(envoyerEmail).not.toHaveBeenCalled();
    const apres = await traces();
    expect(apres.interactions.length).toBe(avant.interactions.length);
    expect(apres.souches.length).toBe(avant.souches.length);

    const trop = await envoyerMessageClient(null, formulaire(Array.from({ length: NB_MAX_PIECES_EMAIL + 1 }, (_, i) => fichier(PDF, `p${i}.pdf`))));
    expect(trop).toMatchObject({ erreur: expect.stringContaining("5 pièces jointes") });
    expect(envoyerEmail).not.toHaveBeenCalled();
  }, 60_000);

  test("un autre espace ne peut pas écrire à ce client ni voir ce qui est parti (fuite délibérée)", async () => {
    connecte = { utilisateurId: adminB, entrepriseId: idB, role: "ADMIN" };
    const r = await envoyerMessageClient(null, formulaire([fichier(PDF, "intrus.pdf")]));
    expect(r).toMatchObject({ erreur: "Contact introuvable." });
    expect(envoyerEmail).not.toHaveBeenCalled();

    const vuParB = await avecEntreprise(idB, (tx) => tx.select().from(emailEnvoye).where(eq(emailEnvoye.contactId, contactA)));
    expect(vuParB).toEqual([]);
  }, 60_000);

  test("sans le droit d'écrire aux clients, rien ne part", async () => {
    connecte = { utilisateurId: adminA, entrepriseId: idA, role: "COMPTABLE" };
    const r = await envoyerMessageClient(null, formulaire([fichier(PDF, "devis.pdf")]));
    expect(r).toMatchObject({ erreur: "Vous n'avez pas le droit d'écrire à ce client." });
    expect(envoyerEmail).not.toHaveBeenCalled();
  }, 60_000);
});
