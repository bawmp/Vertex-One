import { describe, test, expect, beforeAll, afterAll, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, utilisateur, produit } from "@/db/schema";
import type { UtilisateurConnecte } from "@/lib/session";
import { lireCsv } from "@/lib/import/csv";
import { DEFINITIONS, proposerCorrespondance } from "@/lib/import/definitions";
import { versTableau } from "@/lib/import/fichier";
import { appliquerCorrespondance, executerImport } from "@/lib/import/moteur";
import { ErreurImage, chargerImagesEnAttente, etatImages, telechargerImage } from "@/lib/produits/image-distante";
import { supprimerEntrepriseDeTest } from "./aide-nettoyage";

vi.mock("server-only", () => ({}));

/* ------------------------------------------------------------ octets d'images ------------------------------------------------------------ */
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(40, 1)]);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(40, 2)]);
const WEBP = Buffer.concat([Buffer.from("RIFF"), Buffer.from([0x24, 0, 0, 0]), Buffer.from("WEBP"), Buffer.alloc(30, 3)]);
const HTML = Buffer.from("<html><body>Page d'erreur</body></html>");

const PUBLIQUE = async () => ["41.202.12.9"];
function reponse(statut: number, corps: Buffer | string = "", entetes: Record<string, string> = {}) {
  return async () => new Response(statut === 200 ? new Uint8Array(Buffer.from(corps)) : null, { status: statut, headers: entetes });
}
const telecharger = (adresse: string, fetchImpl: typeof fetch, resolveur = PUBLIQUE) => telechargerImage(adresse, { resolveur, fetchImpl: fetchImpl as typeof fetch });
const erreur = async (p: Promise<unknown>) => p.then(() => null, (e: unknown) => e as ErreurImage);

describe("Téléchargement d'une image par adresse web — garde et vérification des octets", () => {
  test("JPEG, PNG et WebP sont reconnus sur leurs OCTETS, quel que soit le type annoncé par le serveur", async () => {
    for (const [octets, mime, ext] of [[PNG, "image/png", "png"], [JPEG, "image/jpeg", "jpg"], [WEBP, "image/webp", "webp"]] as const) {
      const r = await telecharger("https://cdn.exemple.cm/photo", reponse(200, octets, { "content-type": "text/plain" }) as unknown as typeof fetch);
      expect(r).toMatchObject({ mime, extension: ext });
      expect(r.octets.equals(octets)).toBe(true);
    }
  });

  test("une page web ou un fichier qui n'est pas une image est refusé, même avec une extension .jpg et un type image/jpeg", async () => {
    const e = await erreur(telecharger("https://cdn.exemple.cm/photo.jpg", reponse(200, HTML, { "content-type": "image/jpeg" }) as unknown as typeof fetch));
    expect(e).toBeInstanceOf(ErreurImage);
    expect(e).toMatchObject({ definitive: true });
    expect(e!.message).toMatch(/pas une image/);
  });

  test("adresses refusées AVANT tout appel : http, port, identifiants, adresse numérique, nom sans point, texte quelconque", async () => {
    let appels = 0;
    const faux = (async () => { appels++; return new Response(null, { status: 200 }); }) as unknown as typeof fetch;
    for (const adresse of ["http://cdn.exemple.cm/a.png", "https://cdn.exemple.cm:8443/a.png", "https://u:p@cdn.exemple.cm/a.png", "https://127.0.0.1/a.png", "https://169.254.169.254/latest", "https://[::1]/a.png", "https://localhost/a.png", "pas une adresse", ""]) {
      const e = await erreur(telecharger(adresse, faux));
      expect(e, adresse).toMatchObject({ definitive: true });
    }
    expect(appels).toBe(0);
  });

  test("un nom qui pointe vers un réseau interne (même parmi d'autres adresses) est refusé sans rien envoyer", async () => {
    let appels = 0;
    const faux = (async () => { appels++; return new Response(null, { status: 200 }); }) as unknown as typeof fetch;
    for (const ips of [["10.0.0.5"], ["41.202.12.9", "169.254.169.254"], ["127.0.0.1"], ["192.168.1.2"]]) {
      const e = await erreur(telecharger("https://piege.exemple.cm/a.png", faux, async () => ips));
      expect(e).toMatchObject({ definitive: true });
      expect(e!.message).toMatch(/pas autorisée/);
    }
    expect(appels).toBe(0);
  });

  test("redirection jamais suivie (définitif) ; 404 définitif ; 500, 429, réseau coupé et nom introuvable passagers", async () => {
    expect(await erreur(telecharger("https://cdn.exemple.cm/a", reponse(302, "", { location: "http://169.254.169.254/" }) as unknown as typeof fetch))).toMatchObject({ definitive: true });
    expect(await erreur(telecharger("https://cdn.exemple.cm/a", reponse(404) as unknown as typeof fetch))).toMatchObject({ definitive: true });
    expect(await erreur(telecharger("https://cdn.exemple.cm/a", reponse(403) as unknown as typeof fetch))).toMatchObject({ definitive: true });
    for (const statut of [500, 502, 429]) expect(await erreur(telecharger("https://cdn.exemple.cm/a", reponse(statut) as unknown as typeof fetch)), String(statut)).toMatchObject({ definitive: false });
    expect(await erreur(telecharger("https://cdn.exemple.cm/a", (async () => { throw new TypeError("fetch failed"); }) as unknown as typeof fetch))).toMatchObject({ definitive: false });
    expect(await erreur(telecharger("https://cdn.exemple.cm/a", reponse(200, PNG) as unknown as typeof fetch, async () => { throw new Error("EAI_AGAIN"); }))).toMatchObject({ definitive: false });
  });

  test("une image trop lourde est refusée, qu'elle annonce sa taille ou non (lecture bornée)", async () => {
    const enorme = Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024, 7)]);
    expect(await erreur(telecharger("https://cdn.exemple.cm/a", reponse(200, PNG, { "content-length": String(6 * 1024 * 1024) }) as unknown as typeof fetch))).toMatchObject({ definitive: true });
    const e = await erreur(telecharger("https://cdn.exemple.cm/a", reponse(200, enorme) as unknown as typeof fetch));
    expect(e).toMatchObject({ definitive: true });
    expect(e!.message).toMatch(/trop lourde/);
  });
});

/* ------------------------------------------------------------ base réelle ------------------------------------------------------------ */
const suffixe = Math.random().toString(36).slice(2, 8);
const nomA = `TEST ImagesDistantes A ${suffixe}`;
const nomB = `TEST ImagesDistantes B ${suffixe}`;
let idA = "", idB = "", adminA = "", adminB = "";

const utilisateurA = () => ({ utilisateurId: adminA, entrepriseId: idA, role: "ADMIN" }) as unknown as UtilisateurConnecte;
async function importer(csv: string) {
  const tableau = versTableau(lireCsv(csv));
  if (!tableau.ok) throw new Error(tableau.erreur);
  const lignes = appliquerCorrespondance(tableau.lignes, proposerCorrespondance(tableau.entetes, DEFINITIONS.PRODUITS.champs));
  return avecEntreprise(idA, (tx) => executerImport(tx, utilisateurA(), "PRODUITS", lignes, {}));
}
const ligne = (entrepriseId: string, nom: string) => avecEntreprise(entrepriseId, async (tx) => (await tx.select().from(produit).where(eq(produit.nom, nom)))[0]);

beforeAll(async () => {
  const [a] = await db.insert(entreprise).values({ nom: nomA, secteurProfil: "agence" }).returning({ id: entreprise.id });
  const [b] = await db.insert(entreprise).values({ nom: nomB, secteurProfil: "agence" }).returning({ id: entreprise.id });
  idA = a.id;
  idB = b.id;
  [{ id: adminA }] = await db.insert(utilisateur).values({ entrepriseId: idA, email: `admin-a-${suffixe}@vertexone.test`, nomComplet: "Admin A", role: "ADMIN", statut: "ACTIF" }).returning({ id: utilisateur.id });
  [{ id: adminB }] = await db.insert(utilisateur).values({ entrepriseId: idB, email: `admin-b-${suffixe}@vertexone.test`, nomComplet: "Admin B", role: "ADMIN", statut: "ACTIF" }).returning({ id: utilisateur.id });
}, 240_000);

afterAll(async () => {
  await supprimerEntrepriseDeTest(nomA);
  await supprimerEntrepriseDeTest(nomB);
}, 240_000);

describe("Import de produits — prix d'achat, description, image", () => {
  test("le prix d'achat, la description, le code et l'adresse de l'image sont repris ; une adresse non HTTPS est refusée et signalée", async () => {
    const csv = [
      `Nom,SKU,Prix de vente,Prix d'achat,Stock,Type,Description,Image`,
      `Jouet ${suffixe},ENF-${suffixe},5000,"3 200",10,Goods,"Un beau jouet, en bois",https://cdn.exemple.cm/a.png`,
      `Poupée ${suffixe},ENF2-${suffixe},7500,4000,5,Goods,Poupée en tissu,http://cdn.exemple.cm/b.png`,
      `Casque ${suffixe},ELE-${suffixe},15000,9000,2,Goods,,https://cdn.exemple.cm/c.png https://cdn.exemple.cm/d.png`,
      `Sans image ${suffixe},SI-${suffixe},1000,500,1,Goods,,`,
    ].join("\n");
    const r = await importer(csv);
    expect(r).toMatchObject({ crees: 4, nbErreurs: 0 });
    expect(r.avertissements.map((a) => a.message).join(" ")).toMatch(/sans image/);
    expect(r.resume.some((x) => /Images à charger/.test(x.libelle) && x.nombre === 2)).toBe(true);

    const jouet = await ligne(idA, `Jouet ${suffixe}`);
    expect(jouet).toMatchObject({ prixVente: 5000, prixAchat: 3200, codeBarres: `ENF-${suffixe}`, description: "Un beau jouet, en bois", imageSourceUrl: "https://cdn.exemple.cm/a.png", suiviStock: true, stockActuel: 10 });
    expect((await ligne(idA, `Poupée ${suffixe}`)).imageSourceUrl).toBeNull(); // http : refusée
    expect((await ligne(idA, `Casque ${suffixe}`)).imageSourceUrl).toBe("https://cdn.exemple.cm/c.png"); // plusieurs adresses : la première
    expect((await ligne(idA, `Sans image ${suffixe}`)).imageSourceUrl).toBeNull();
  }, 240_000);
});

describe("Chargement des images en attente", () => {
  const stockees: string[] = [];
  const televerser = vi.fn(async (p: { entrepriseId: string; nomFichier: string; typeMime: string; contenu: Buffer; dossier?: string }) => {
    const cle = `${p.entrepriseId}/${p.dossier}/${p.nomFichier}`;
    stockees.push(cle);
    return { cleStockage: cle, televerse: true };
  });

  test("les images sont téléchargées, rangées sous l'entreprise, et l'adresse est vidée ; un refus définitif garde son motif ; une panne passagère garde l'adresse", async () => {
    const reponses: Record<string, () => Promise<unknown>> = {
      "https://cdn.exemple.cm/a.png": async () => ({ octets: PNG, mime: "image/png", extension: "png" }),
      "https://cdn.exemple.cm/c.png": async () => { throw new ErreurImage("Ce fichier n'est pas une image JPEG, PNG ou WebP.", true); },
    };
    // Un troisième produit avec une panne passagère.
    await avecEntreprise(idA, (tx) => tx.update(produit).set({ imageSourceUrl: "https://cdn.exemple.cm/panne.png" }).where(eq(produit.nom, `Sans image ${suffixe}`)));
    reponses["https://cdn.exemple.cm/panne.png"] = async () => { throw new ErreurImage("Le site de l'image ne répond pas.", false); };

    const r = await chargerImagesEnAttente(idA, { telecharger: (async (adresse: string) => reponses[adresse]()) as never, televerser: televerser as never });
    expect(r).toMatchObject({ chargees: 1, refusees: 1, enAttente: 1, stockageIndisponible: false });

    const jouet = await ligne(idA, `Jouet ${suffixe}`);
    expect(jouet.imageCleStockage).toBe(`${idA}/produits/produit-${jouet.id}.png`);
    expect(jouet).toMatchObject({ imageTypeMime: "image/png", imageSourceUrl: null, imageSourceErreur: null });
    expect(jouet.imageCleStockage!.startsWith(`${idA}/`)).toBe(true); // toujours sous le dossier de CETTE entreprise

    const casque = await ligne(idA, `Casque ${suffixe}`);
    expect(casque).toMatchObject({ imageCleStockage: null, imageSourceUrl: null });
    expect(casque.imageSourceErreur).toMatch(/pas une image/);

    const panne = await ligne(idA, `Sans image ${suffixe}`);
    expect(panne).toMatchObject({ imageSourceUrl: "https://cdn.exemple.cm/panne.png", imageSourceErreur: null }); // on retentera
  }, 240_000);

  test("l'état montre ce qui attend et les refus avec leur motif", async () => {
    const etat = await etatImages(idA);
    expect(etat.enAttente).toBe(1);
    expect(etat.refusees).toHaveLength(1);
    expect(etat.refusees[0]).toMatchObject({ nom: `Casque ${suffixe}` });
    expect(etat.refusees[0].motif).toMatch(/pas une image/);
  }, 120_000);

  /** Un produit dédié à un test (jamais celui d'un test précédent), avec ou sans image déjà posée à la main. */
  const produitEnAttente = (nom: string, adresse: string, imageExistante: string | null = null) =>
    avecEntreprise(idA, async (tx) => (await tx.insert(produit).values({ entrepriseId: idA, creeParId: adminA, type: "BIEN", nom, imageSourceUrl: adresse, imageCleStockage: imageExistante, imageTypeMime: imageExistante ? "image/jpeg" : null }).returning({ id: produit.id }))[0].id);
  /** Télécharge UNIQUEMENT les adresses connues ; toute autre adresse (reste d'un autre test) échoue de façon passagère et n'est donc pas touchée. */
  const seulement = (octets: Buffer, ...adresses: string[]) => (async (adresse: string) => {
    if (!adresses.includes(adresse)) throw new ErreurImage("Le site de l'image ne répond pas.", false);
    return { octets, mime: "image/png", extension: "png" };
  }) as never;

  test("une image posée à la main n'est JAMAIS écrasée : rien n'est téléchargé pour ce produit, son adresse est simplement vidée", async () => {
    const nom = `Photo à la main ${suffixe}`;
    const id = await produitEnAttente(nom, "https://cdn.exemple.cm/autre.png", `${idA}/ma-photo.jpg`);
    const appels: string[] = [];
    const surveille = (async (adresse: string) => { appels.push(adresse); return { octets: PNG, mime: "image/png", extension: "png" }; }) as never;
    await chargerImagesEnAttente(idA, { telecharger: surveille, televerser: televerser as never });
    expect(appels).not.toContain("https://cdn.exemple.cm/autre.png");
    expect(await ligne(idA, nom)).toMatchObject({ id, imageCleStockage: `${idA}/ma-photo.jpg`, imageTypeMime: "image/jpeg", imageSourceUrl: null });
  }, 240_000);

  test("stockage indisponible : l'adresse est gardée, rien n'est perdu, et le résultat le dit", async () => {
    const nom = `Stockage en panne ${suffixe}`;
    await produitEnAttente(nom, "https://cdn.exemple.cm/z.png");
    const r = await chargerImagesEnAttente(idA, {
      telecharger: seulement(PNG, "https://cdn.exemple.cm/z.png"),
      televerser: (async () => ({ cleStockage: "x", televerse: false, erreur: "R2 non configuré" })) as never,
    });
    expect(r).toMatchObject({ chargees: 0, stockageIndisponible: true });
    expect(await ligne(idA, nom)).toMatchObject({ imageSourceUrl: "https://cdn.exemple.cm/z.png", imageCleStockage: null });
  }, 240_000);

  test("une autre entreprise ne voit pas les images en attente de la première, et traiter la sienne ne touche à rien d'autre", async () => {
    await avecEntreprise(idB, (tx) => tx.insert(produit).values({ entrepriseId: idB, creeParId: adminB, type: "BIEN", nom: `Article B ${suffixe}`, imageSourceUrl: "https://cdn.exemple.cm/b.png" }));
    expect((await etatImages(idB)).enAttente).toBe(1); // seulement la sienne
    const avantA = (await etatImages(idA)).enAttente;
    const telechargees: string[] = [];
    const r = await chargerImagesEnAttente(idB, { telecharger: (async (adresse: string) => { telechargees.push(adresse); return { octets: JPEG, mime: "image/jpeg", extension: "jpg" }; }) as never, televerser: televerser as never });
    expect(r.chargees).toBe(1);
    expect(telechargees).toEqual(["https://cdn.exemple.cm/b.png"]); // jamais une adresse de l'entreprise A
    expect((await etatImages(idA)).enAttente).toBe(avantA);
    const b = await ligne(idB, `Article B ${suffixe}`);
    expect(b.imageCleStockage!.startsWith(`${idB}/`)).toBe(true);
  }, 240_000);
});
