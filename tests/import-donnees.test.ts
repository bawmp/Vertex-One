import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, utilisateur, contact, compteClient, produit, projet, tache, dossier, commentaire, facture, ligneFacture, paiement, devis, ligneDevis, ecritureComptable, notePersonnelle } from "@/db/schema";
import type { UtilisateurConnecte } from "@/lib/session";
import { lireCsv } from "@/lib/import/csv";
import { DEFINITIONS, proposerCorrespondance, type TypeImport } from "@/lib/import/definitions";
import { versTableau } from "@/lib/import/fichier";
import { appliquerCorrespondance, executerImport, SimulationTerminee, type Rapport } from "@/lib/import/moteur";
import { supprimerEntrepriseDeTest } from "./aide-nettoyage";

const suffixe = Math.random().toString(36).slice(2, 8);
const nomA = `TEST Import A ${suffixe}`;
const nomB = `TEST Import B ${suffixe}`;

let idA: string;
let idB: string;
let adminA: UtilisateurConnecte;
let adminB: UtilisateurConnecte;
let collegueA: { id: string; email: string };

/** Reproduit exactement ce que fait l'action serveur : mêmes appels, simulation = transaction annulée. */
async function lancer(user: UtilisateurConnecte, type: TypeImport, csv: string, opts: { simulation?: boolean; contactProjetsId?: string } = {}): Promise<Rapport> {
  const tableau = versTableau(lireCsv(csv));
  if (!tableau.ok) throw new Error(tableau.erreur);
  const correspondance = proposerCorrespondance(tableau.entetes, DEFINITIONS[type].champs);
  const lignes = appliquerCorrespondance(tableau.lignes, correspondance);
  try {
    return await avecEntreprise(user.entrepriseId, async (tx) => {
      const rapport = await executerImport(tx, user, type, lignes, { contactProjetsId: opts.contactProjetsId });
      if (opts.simulation) throw new SimulationTerminee(rapport);
      return rapport;
    });
  } catch (e) {
    if (e instanceof SimulationTerminee) return e.rapport;
    throw e;
  }
}

const compterLignes = async (entrepriseId: string) =>
  avecEntreprise(entrepriseId, async (tx) => ({
    contacts: (await tx.select().from(contact)).length,
    produits: (await tx.select().from(produit)).length,
    projets: (await tx.select().from(projet)).length,
    taches: (await tx.select().from(tache)).length,
    factures: (await tx.select().from(facture)).length,
    devis: (await tx.select().from(devis)).length,
  }));

beforeAll(async () => {
  const [a] = await db.insert(entreprise).values({ nom: nomA, secteurProfil: "agence" }).returning({ id: entreprise.id });
  const [b] = await db.insert(entreprise).values({ nom: nomB, secteurProfil: "agence" }).returning({ id: entreprise.id });
  idA = a.id;
  idB = b.id;
  const [uA] = await db.insert(utilisateur).values({ entrepriseId: idA, email: `admin-a-${suffixe}@vertexone.test`, nomComplet: "Alice Admin", role: "ADMIN" }).returning({ id: utilisateur.id });
  const [cA] = await db.insert(utilisateur).values({ entrepriseId: idA, email: `bob-${suffixe}@vertexone.test`, nomComplet: "Bob Collègue", role: "EMPLOYE" }).returning({ id: utilisateur.id, email: utilisateur.email });
  const [uB] = await db.insert(utilisateur).values({ entrepriseId: idB, email: `admin-b-${suffixe}@vertexone.test`, nomComplet: "Bertrand Admin", role: "ADMIN" }).returning({ id: utilisateur.id });
  adminA = { utilisateurId: uA.id, entrepriseId: idA, role: "ADMIN", modulesAutorises: null };
  adminB = { utilisateurId: uB.id, entrepriseId: idB, role: "ADMIN", modulesAutorises: null };
  collegueA = { id: cA.id, email: cA.email };
}, 120_000);

afterAll(async () => {
  await supprimerEntrepriseDeTest(nomA);
  await supprimerEntrepriseDeTest(nomB);
}, 120_000);

describe("Import — contacts", () => {
  const csv = [
    "First Name,Last Name,Account Name,Email,Phone,Title,Contact Owner",
    "Jean,Dupont,Société Alpha,jean@alpha.cm,690 11 12 22,Directeur,",
    "Marie,Nguema,société alpha,marie@alpha.cm,677 00 00 01,Comptable,bob-owner@inconnu.cm",
    ",,,orphelin@x.cm,,,", // aucun nom : erreur
    "Jean,Dupont,Société Alpha,JEAN@alpha.cm,690111222,,", // même email (casse différente) : doublon dans le fichier
    "Luc,Fotso,,,+237 690 11 12 22,,", // même téléphone que Jean, écrit autrement : doublon
    "Sans,Telephone,Société Beta,sans@beta.cm,,,",
  ].join("\n");

  test("simulation : annonce le résultat sans rien écrire", async () => {
    const avant = await compterLignes(idA);
    const rapport = await lancer(adminA, "CONTACTS", csv, { simulation: true });
    expect(rapport.crees).toBe(3);
    expect(rapport.ignores).toBe(2);
    expect(rapport.nbErreurs).toBe(1);
    expect(await compterLignes(idA)).toEqual(avant);
    expect(await avecEntreprise(idA, (tx) => tx.select().from(compteClient))).toHaveLength(0);
  }, 120_000);

  test("import réel : contacts, sociétés dédoublonnées (sans accents ni casse), responsable inconnu remplacé par l'importateur", async () => {
    const rapport = await lancer(adminA, "CONTACTS", csv);
    expect(rapport.crees).toBe(3);
    expect(rapport.resume).toContainEqual({ libelle: "Sociétés créées", nombre: 2 }); // Alpha (une seule fois) et Beta
    expect(rapport.avertissements.map((a) => a.message).join(" ")).toContain("Responsables absents");
    expect(rapport.avertissements.map((a) => a.message).join(" ")).toContain("sans téléphone");

    const { contacts, comptes } = await avecEntreprise(idA, async (tx) => ({ contacts: await tx.select().from(contact), comptes: await tx.select().from(compteClient) }));
    expect(comptes.map((c) => c.nom).sort()).toEqual(["Société Alpha", "Société Beta"]);
    const jean = contacts.find((c) => c.nom === "Jean Dupont")!;
    expect(jean.compteId).toBe(comptes.find((c) => c.nom === "Société Alpha")!.id);
    expect(jean.assigneAId).toBe(adminA.utilisateurId);
    expect(contacts.find((c) => c.nom === "Sans Telephone")!.telephone).toBe("Non renseigné");
  }, 120_000);

  test("rejouer le même fichier ne crée rien : tout est ignoré comme doublon", async () => {
    const rapport = await lancer(adminA, "CONTACTS", csv);
    expect(rapport.crees).toBe(0);
    expect(rapport.ignores).toBe(5);
  }, 120_000);

  test("le responsable désigné par son email est retrouvé dans l'équipe de la même entreprise", async () => {
    await lancer(adminA, "CONTACTS", `Nom,Email,Phone,Owner\nClient Confié,confie@x.cm,655 00 00 09,${collegueA.email}`);
    const [c] = await avecEntreprise(idA, (tx) => tx.select().from(contact).where(eq(contact.nom, "Client Confié")));
    expect(c.assigneAId).toBe(collegueA.id);
  }, 120_000);
});

describe("Import — produits", () => {
  const csv = "Item Name,Rate,Purchase Rate,Item Type,Stock On Hand,Description\nRouter Wi-Fi,\"45 000\",30000,Goods,12,Routeur\nInstallation,25000,0,Service,,Main d'œuvre\nRouter Wi-Fi,1,1,Goods,1,doublon\nGratuit,-5,0,Service,,";

  test("biens avec stock, services sans suivi de stock, doublon et prix négatif refusés", async () => {
    const rapport = await lancer(adminA, "PRODUITS", csv);
    expect(rapport.crees).toBe(2);
    expect(rapport.ignores).toBe(1);
    expect(rapport.nbErreurs).toBe(1);
    const produits = await avecEntreprise(idA, (tx) => tx.select().from(produit));
    const routeur = produits.find((p) => p.nom === "Router Wi-Fi")!;
    expect(routeur).toMatchObject({ type: "BIEN", prixVente: 45000, prixAchat: 30000, suiviStock: true, stockActuel: 12 });
    expect(produits.find((p) => p.nom === "Installation")).toMatchObject({ type: "SERVICE", suiviStock: false, stockActuel: 0 });
  }, 120_000);
});

describe("Import — projets et tâches (export Asana)", () => {
  const csv = [
    "Task ID,Created At,Completed At,Name,Section/Column,Assignee,Assignee Email,Start Date,Due Date,Notes,Projects,Parent task",
    `1,2026-01-01,2026-02-01,Maquette du site,Done,Bob Collègue,,2026-01-05,2026-02-01,Version validée,Refonte site,`,
    `2,2026-01-02,,Développement,In progress,,${"bob-" + suffixe + "@vertexone.test"},2026-02-02,2026-03-15,,Refonte site,`,
    `3,2026-01-03,,Tests,Backlog,Inconnu Dehors,,,,,Refonte site,Développement`,
    `4,2026-01-04,,Acheter le nom de domaine,,,,,,,,`,
  ].join("\n");

  test("projets créés sous un client interne « Projets importés », statuts et dates déduits, sous-tâche rattachée à sa parente, notes en commentaire", async () => {
    const rapport = await lancer(adminA, "PROJETS_TACHES", csv);
    expect(rapport.crees).toBe(4);
    expect(rapport.resume).toContainEqual({ libelle: "Projets créés", nombre: 2 }); // « Refonte site » + « Tâches importées »

    const { projets, taches, dossiers, comm } = await avecEntreprise(idA, async (tx) => ({
      projets: await tx.select().from(projet),
      taches: await tx.select().from(tache),
      dossiers: await tx.select().from(dossier),
      comm: await tx.select().from(commentaire),
    }));
    const refonte = projets.find((p) => p.titre === "Refonte site")!;
    expect(refonte.statut).toBe("EN_COURS");
    expect(refonte.dateDebut?.toISOString().slice(0, 10)).toBe("2026-01-05");
    expect(refonte.dateEcheance?.toISOString().slice(0, 10)).toBe("2026-03-15");
    expect(projets.find((p) => p.titre === "Tâches importées")).toBeTruthy();
    expect(dossiers.some((d) => d.id === refonte.dossierId)).toBe(true);

    const maquette = taches.find((t) => t.titre === "Maquette du site")!;
    expect(maquette).toMatchObject({ statut: "TERMINEE", assigneAId: collegueA.id });
    expect(maquette.termineeLe?.toISOString().slice(0, 10)).toBe("2026-02-01");
    expect(taches.find((t) => t.titre === "Développement")).toMatchObject({ statut: "EN_COURS", assigneAId: collegueA.id }); // retrouvé par son email
    expect(taches.find((t) => t.titre === "Développement › Tests")).toMatchObject({ statut: "A_FAIRE", assigneAId: adminA.utilisateurId }); // « Inconnu Dehors » → l'importateur
    expect(comm.some((c) => c.contenu.includes("Version validée"))).toBe(true);
  }, 120_000);

  test("rejouer le fichier ne duplique ni projet ni tâche", async () => {
    const avant = await compterLignes(idA);
    const rapport = await lancer(adminA, "PROJETS_TACHES", csv);
    expect(rapport.crees).toBe(0);
    expect(rapport.ignores).toBe(4);
    expect(await compterLignes(idA)).toEqual(avant);
  }, 120_000);
});

describe("Import — devis et factures historiques (export Zoho Books)", () => {
  const csvFactures = [
    "Invoice Date,Invoice Number,Invoice Status,Customer Name,Due Date,Item Name,Quantity,Item Price,Item Tax %,Total",
    "2025-11-05,INV-000101,Paid,Client Historique SA,2025-12-05,Site vitrine,1,\"200 000\",19.25,238500",
    "2025-11-05,INV-000101,Paid,Client Historique SA,2025-12-05,Hébergement,2,\"15 000\",19.25,238500",
    "2025-12-01,INV-000102,Sent,Société Alpha,2025-12-31,Maintenance,1,50000,0,50000",
    "2025-12-02,INV-000103,Draft,Société Alpha,,Brouillon,1,1000,0,1000",
    "2025-12-03,INV-000104,Void,Client Historique SA,2026-01-03,Erreur,1,1000,0,1000",
  ].join("\n");

  test("regroupe les lignes par numéro, garde le numéro d'origine, ajoute le règlement, écarte le brouillon, ne génère aucune écriture comptable", async () => {
    const rapport = await lancer(adminA, "FACTURES", csvFactures);
    expect(rapport.crees).toBe(3);
    expect(rapport.ignores).toBe(1); // le brouillon
    const { factures, lignes, paiements, ecritures } = await avecEntreprise(idA, async (tx) => ({
      factures: await tx.select().from(facture),
      lignes: await tx.select().from(ligneFacture),
      paiements: await tx.select().from(paiement),
      ecritures: await tx.select().from(ecritureComptable),
    }));
    const f101 = factures.find((f) => f.numero === "INV-000101")!;
    // 200 000 + 2 × 15 000 = 230 000 HT ; TVA 19,25 % arrondie par ligne : 38 500 + 5 775 = 44 275 → TTC 274 275
    expect(f101).toMatchObject({ statut: "PAYEE", montantHT: 230000, montantTVA: 44275, montantTTC: 274275 });
    expect(lignes.filter((l) => l.factureId === f101.id)).toHaveLength(2);
    expect(paiements.find((p) => p.factureId === f101.id)).toMatchObject({ montant: 274275, moyenPaiement: "manuel", saisiParId: adminA.utilisateurId });
    expect(factures.find((f) => f.numero === "INV-000102")).toMatchObject({ statut: "EMISE", montantTTC: 50000 });
    expect(factures.find((f) => f.numero === "INV-000104")?.statut).toBe("ANNULEE");
    expect(factures.some((f) => f.numero === "INV-000103")).toBe(false);
    expect(ecritures).toHaveLength(0);
    // Le total du fichier (238 500) diffère de la somme des lignes : signalé, jamais retenu en silence.
    expect(rapport.avertissements.map((a) => a.message).join(" ")).toContain("INV-000101");
    // « Société Alpha » existait (import de contacts) : sa facture est rattachée à son premier contact et à la société ;
    // seul « Client Historique SA » est créé.
    expect(rapport.resume).toContainEqual({ libelle: "Clients créés", nombre: 1 });
    const { jean, alpha } = await avecEntreprise(idA, async (tx) => ({
      jean: (await tx.select().from(contact).where(eq(contact.nom, "Jean Dupont")))[0],
      alpha: (await tx.select().from(compteClient).where(eq(compteClient.nom, "Société Alpha")))[0],
    }));
    expect(factures.find((f) => f.numero === "INV-000102")).toMatchObject({ contactId: jean.id, compteId: alpha.id });
  }, 180_000);

  test("un numéro déjà présent est ignoré, jamais écrasé", async () => {
    const avant = await compterLignes(idA);
    const rapport = await lancer(adminA, "FACTURES", csvFactures);
    expect(rapport.crees).toBe(0);
    expect(await compterLignes(idA)).toEqual(avant);
  }, 120_000);

  test("devis : statuts d'origine conservés, montant seul (une ligne par devis) accepté", async () => {
    const rapport = await lancer(adminA, "DEVIS", ["Estimate Number,Estimate Status,Customer Name,Estimate Date,Expiry Date,Total", "QT-001,Accepted,Société Alpha,2025-10-01,2025-10-31,119250", "QT-002,Declined,Client Historique SA,2025-10-02,,\"10 000\""].join("\n"));
    expect(rapport.crees).toBe(2);
    const { d, l } = await avecEntreprise(idA, async (tx) => ({ d: await tx.select().from(devis), l: await tx.select().from(ligneDevis) }));
    const qt1 = d.find((x) => x.numero === "QT-001")!;
    expect(qt1).toMatchObject({ statut: "ACCEPTE", montantTTC: 119250 }); // TVA 19,25 % supposée : 100 000 HT + 19 250
    expect(qt1.montantHT).toBe(100000);
    expect(d.find((x) => x.numero === "QT-002")?.statut).toBe("REFUSE");
    expect(l).toHaveLength(2);
    expect(rapport.avertissements.map((a) => a.message).join(" ")).toContain("19,25");
  }, 120_000);

  test("un fichier sans aucun montant est refusé ligne par ligne, sans rien écrire", async () => {
    const avant = await compterLignes(idA);
    const rapport = await lancer(adminA, "FACTURES", "Invoice Number,Customer Name\nINV-9,Quelqu'un");
    expect(rapport.crees).toBe(0);
    expect(rapport.nbErreurs).toBe(1);
    expect(await compterLignes(idA)).toEqual(avant);
  }, 120_000);
});

describe("Import — notes personnelles", () => {
  test("ajoutées à la suite du bloc-notes de l'importateur ; rejouer n'ajoute rien", async () => {
    const csv = 'Title,Content\nIdées,"Lancer une offre ""pack démarrage"""\nRappel,Relancer le fournisseur';
    const r1 = await lancer(adminA, "NOTES", csv);
    expect(r1.crees).toBe(2);
    const r2 = await lancer(adminA, "NOTES", csv);
    expect(r2.crees).toBe(0);
    expect(r2.ignores).toBe(2);
    const [note] = await avecEntreprise(idA, (tx) => tx.select().from(notePersonnelle).where(eq(notePersonnelle.utilisateurId, adminA.utilisateurId)));
    expect(note.contenu).toContain("## Idées\nLancer une offre \"pack démarrage\"");
    expect(note.contenu).toContain("## Rappel\nRelancer le fournisseur");
  }, 120_000);
});

describe("Import — isolation entre entreprises (fuite délibérée)", () => {
  test("rien de ce qui a été importé chez A n'est visible chez B", async () => {
    const chezB = await compterLignes(idB);
    expect(chezB).toEqual({ contacts: 0, produits: 0, projets: 0, taches: 0, factures: 0, devis: 0 });
    expect(await avecEntreprise(idB, (tx) => tx.select().from(paiement))).toHaveLength(0);
    expect(await avecEntreprise(idB, (tx) => tx.select().from(notePersonnelle))).toHaveLength(0);
  }, 120_000);

  test("un « responsable » qui est un utilisateur d'une autre entreprise n'est jamais retenu : remplacé par l'importateur", async () => {
    await lancer(adminB, "CONTACTS", `Nom,Phone,Owner\nContact Volé,655 11 22 33,${collegueA.email}`);
    const [c] = await avecEntreprise(idB, (tx) => tx.select().from(contact).where(eq(contact.nom, "Contact Volé")));
    expect(c.assigneAId).toBe(adminB.utilisateurId);
  }, 120_000);

  test("rattacher des projets au client d'une autre entreprise est refusé, sans rien créer", async () => {
    const [clientA] = await avecEntreprise(idA, (tx) => tx.select().from(contact).limit(1));
    const rapport = await lancer(adminB, "PROJETS_TACHES", "Name,Projects\nTâche pirate,Projet pirate", { contactProjetsId: clientA.id });
    expect(rapport.nbErreurs).toBe(1);
    expect(rapport.crees).toBe(0);
    expect((await compterLignes(idB)).projets).toBe(0);
    // Et rien n'a été rattaché côté A.
    expect((await avecEntreprise(idA, (tx) => tx.select().from(projet).where(eq(projet.titre, "Projet pirate")))).length).toBe(0);
  }, 120_000);

  test("un doublon est cherché dans l'entreprise courante seulement : le même contact peut exister chez B", async () => {
    const rapport = await lancer(adminB, "CONTACTS", "First Name,Last Name,Email,Phone\nJean,Dupont,jean@alpha.cm,690 11 12 22");
    expect(rapport.crees).toBe(1);
    expect(rapport.ignores).toBe(0);
  }, 120_000);
});
