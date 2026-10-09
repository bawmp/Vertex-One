import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { db, avecEntreprise } from "@/db/client";
import {
  entreprise, utilisateur, compteClient, contact, contactChampPersonnalise, lead, deal, historiqueStatutDeal, produit, devis, ligneDevis, facture, ligneFacture, paiement, modeleEmail, journalExportDonnees,
} from "@/db/schema";
import type { UtilisateurConnecte } from "@/lib/session";
import { lireCsv } from "@/lib/import/csv";
import { DEFINITIONS, proposerCorrespondance, type TypeImport } from "@/lib/import/definitions";
import { versTableau } from "@/lib/import/fichier";
import { appliquerCorrespondance, executerImport, type Rapport } from "@/lib/import/moteur";
import { ecrireCsv } from "@/lib/export/csv";
import { exporterDonnees, compterDonnees, TYPES_EXPORT, type TypeExport } from "@/lib/export/exporteurs";
import { statutLeadDepuisTexte } from "@/lib/import/moteur/leads";
import { statutDealDepuisTexte } from "@/lib/import/moteur/deals";
import { supprimerEntrepriseDeTest } from "./aide-nettoyage";

/**
 * Transfert d'un espace à un autre par fichiers : on remplit l'espace A, on exporte chaque type, on importe les fichiers
 * TELS QUELS (sans toucher à l'association des colonnes) dans l'espace B, puis on compare. Même chaîne que celle de
 * l'utilisateur : export → fichier CSV → assistant d'import (mêmes fonctions que l'action serveur).
 */
const suffixe = Math.random().toString(36).slice(2, 8);
const nomA = `TEST AllerRetour A ${suffixe}`;
const nomB = `TEST AllerRetour B ${suffixe}`;
let idA: string;
let idB: string;
let adminA: UtilisateurConnecte;
let adminB: UtilisateurConnecte;

const ORDRE_IMPORT: TypeExport[] = ["CHAMPS_CONTACT", "CONTACTS", "LEADS", "DEALS", "PRODUITS", "DEVIS", "FACTURES", "MODELES_EMAIL"];
const NOTE_PIEGEE = '=HYPERLINK("http://pirate.example","cliquez")';

const exporterCsv = (entrepriseId: string, type: TypeExport) =>
  avecEntreprise(entrepriseId, async (tx) => {
    const jeu = await exporterDonnees(tx, entrepriseId, type);
    return { jeu, csv: ecrireCsv(jeu.entetes, jeu.lignes) };
  });

/** Ce que fait l'action serveur : lecture du fichier, association automatique des colonnes, import réel. */
async function importer(user: UtilisateurConnecte, type: TypeImport, csv: string): Promise<{ rapport: Rapport; colonnesNonReconnues: string[] }> {
  const tableau = versTableau(lireCsv(csv));
  if (!tableau.ok) throw new Error(`${type} : ${tableau.erreur}`);
  const correspondance = proposerCorrespondance(tableau.entetes, DEFINITIONS[type].champs);
  const reconnues = new Set(Object.values(correspondance));
  const lignes = appliquerCorrespondance(tableau.lignes, correspondance);
  const rapport = await avecEntreprise(user.entrepriseId, (tx) => executerImport(tx, user, type, lignes, {}));
  return { rapport, colonnesNonReconnues: tableau.entetes.filter((e) => !reconnues.has(e)) };
}

beforeAll(async () => {
  const [a] = await db.insert(entreprise).values({ nom: nomA, secteurProfil: "immigration" }).returning({ id: entreprise.id });
  const [b] = await db.insert(entreprise).values({ nom: nomB, secteurProfil: "immigration" }).returning({ id: entreprise.id });
  idA = a.id;
  idB = b.id;
  const [uA] = await db.insert(utilisateur).values({ entrepriseId: idA, email: `admin-a-${suffixe}@vertexone.test`, nomComplet: "Alice Admin", role: "ADMIN" }).returning({ id: utilisateur.id });
  const [uB] = await db.insert(utilisateur).values({ entrepriseId: idB, email: `admin-b-${suffixe}@vertexone.test`, nomComplet: "Bertrand Admin", role: "ADMIN" }).returning({ id: utilisateur.id });
  adminA = { utilisateurId: uA.id, entrepriseId: idA, role: "ADMIN", modulesAutorises: null };
  adminB = { utilisateurId: uB.id, entrepriseId: idB, role: "ADMIN", modulesAutorises: null };

  await avecEntreprise(idA, async (tx) => {
    await tx.insert(contactChampPersonnalise).values([
      { entrepriseId: idA, libelle: "Nationalité", type: "TEXTE_COURT", obligatoire: false, ordre: 0 },
      { entrepriseId: idA, libelle: "Type de visa", type: "LISTE_DEROULANTE", obligatoire: true, options: ["Études", "Travail", "Regroupement familial"], ordre: 1 },
      { entrepriseId: idA, libelle: "Rendez-vous consulaire", type: "DATE", obligatoire: false, ordre: 2 },
    ]);
    const [compte] = await tx.insert(compteClient).values({ entrepriseId: idA, nom: "Garage Mbarga SARL", niu: "M012345678901A" }).returning({ id: compteClient.id });
    const [jean] = await tx.insert(contact).values({ entrepriseId: idA, nom: "Jean Mbarga", telephone: "+237690111222", email: "jean@exemple.test", fonction: "Directeur", notes: NOTE_PIEGEE, compteId: compte.id, assigneAId: uA.id }).returning({ id: contact.id });
    await tx.insert(contact).values({ entrepriseId: idA, nom: "Marie Tchoua", telephone: "Non renseigné", assigneAId: uA.id });

    await tx.insert(lead).values({ entrepriseId: idA, nom: "Paul Ateba", societeCliente: "Ateba & Fils", telephone: "+237677001122", email: "paul@exemple.test", statut: "QUALIFIE", notes: "Visa étudiant Canada", assigneAId: uA.id });
    await tx.insert(deal).values({ entrepriseId: idA, titre: "Site web hôtel", montant: 1_500_000, contactId: jean.id, compteId: compte.id, statut: "NEGOCIATION", dateClotureEstimee: new Date(Date.UTC(2026, 10, 30, 12)), assigneAId: uA.id });

    await tx.insert(produit).values([
      { entrepriseId: idA, type: "BIEN", nom: "Ordinateur portable", description: "15 pouces", prixVente: 400_000, prixAchat: 300_000, suiviStock: true, stockActuel: 5, creeParId: uA.id },
      { entrepriseId: idA, type: "SERVICE", nom: "Maintenance annuelle", prixVente: 50_000, creeParId: uA.id },
    ]);

    const [d] = await tx.insert(devis).values({ entrepriseId: idA, numero: `DEV-A-${suffixe}`, contactId: jean.id, assigneAId: uA.id, statut: "ACCEPTE", dateValidite: new Date(Date.UTC(2026, 11, 15, 12)), montantHT: 250_000, montantTVA: 48_125, montantTTC: 298_125, creeParId: uA.id }).returning({ id: devis.id });
    await tx.insert(ligneDevis).values([
      { entrepriseId: idA, devisId: d.id, designation: "Développement", quantite: 2, prixUnitaire: 100_000, tauxTVA: 19.25 },
      { entrepriseId: idA, devisId: d.id, designation: "Formation", quantite: 1, prixUnitaire: 50_000, tauxTVA: 19.25 },
    ]);

    const [f] = await tx.insert(facture).values({ entrepriseId: idA, numero: `FAC-A-${suffixe}`, contactId: jean.id, assigneAId: uA.id, statut: "PARTIELLEMENT_PAYEE", montantHT: 400_000, montantTVA: 77_000, montantTTC: 477_000, dateEmission: new Date(Date.UTC(2026, 9, 1, 12)), dateEcheance: new Date(Date.UTC(2026, 10, 1, 12)) }).returning({ id: facture.id });
    await tx.insert(ligneFacture).values({ entrepriseId: idA, factureId: f.id, designation: "Ordinateur portable", quantite: 1, prixUnitaire: 400_000, tauxTVA: 19.25 });
    await tx.insert(paiement).values({ entrepriseId: idA, factureId: f.id, montant: 100_000, moyenPaiement: "especes", datePaiement: new Date(Date.UTC(2026, 9, 10, 12)) });

    await tx.insert(modeleEmail).values({ entrepriseId: idA, type: "ENVOI_DEVIS", objet: "Votre devis {{numero}}", corps: "Bonjour {{client}},\nVoici notre devis.\nCordialement,\n{{entreprise}}" });
  });
}, 180_000);

afterAll(async () => {
  await supprimerEntrepriseDeTest(nomA);
  await supprimerEntrepriseDeTest(nomB);
}, 120_000);

describe("Export puis import entre deux espaces séparés", () => {
  const fichiers: Record<string, string> = {};

  test("chaque type s'exporte, avec des en-têtes que l'import reconnaît tous, sans aucune association manuelle", async () => {
    for (const type of TYPES_EXPORT) {
      const { jeu, csv } = await exporterCsv(idA, type);
      expect(jeu.lignes.length, type).toBeGreaterThan(0);
      fichiers[type] = csv;
      const tableau = versTableau(lireCsv(csv));
      expect(tableau.ok, type).toBe(true);
      if (!tableau.ok) continue;
      const correspondance = proposerCorrespondance(tableau.entetes, DEFINITIONS[type].champs);
      const nonReconnues = tableau.entetes.filter((e) => !Object.values(correspondance).includes(e));
      expect(nonReconnues, `${type} : colonnes non reconnues`).toEqual([]);
    }
  });

  test("l'espace B est vide, puis reçoit les fichiers de A dans l'ordre sans la moindre erreur", async () => {
    expect(Object.values(await avecEntreprise(idB, (tx) => compterDonnees(tx, idB))).every((n) => n === 0)).toBe(true);
    for (const type of ORDRE_IMPORT) {
      const { rapport, colonnesNonReconnues } = await importer(adminB, type, fichiers[type]);
      expect(colonnesNonReconnues, type).toEqual([]);
      expect(rapport.nbErreurs, `${type} : ${JSON.stringify(rapport.erreurs)}`).toBe(0);
      expect(rapport.crees, type).toBeGreaterThan(0);
    }
  });

  test("contacts : société, NIU, téléphone, fonction conservés ; le texte piégé retrouve sa valeur d'origine ; aucun doublon", async () => {
    const dansB = await avecEntreprise(idB, async (tx) => ({
      contacts: await tx.select().from(contact),
      comptes: await tx.select().from(compteClient),
    }));
    expect(dansB.contacts).toHaveLength(2); // les deals n'ont pas recréé Jean Mbarga
    const jean = dansB.contacts.find((c) => c.nom === "Jean Mbarga")!;
    expect(jean).toMatchObject({ email: "jean@exemple.test", telephone: "+237690111222", fonction: "Directeur" });
    expect(jean.notes).toBe(NOTE_PIEGEE); // protégée dans le fichier, rendue telle quelle dans l'application
    expect(dansB.comptes).toHaveLength(1);
    expect(dansB.comptes[0]).toMatchObject({ nom: "Garage Mbarga SARL", niu: "M012345678901A" });
    expect(jean.compteId).toBe(dansB.comptes[0].id);
    expect(jean.assigneAId).toBe(adminB.utilisateurId); // le responsable d'A est inconnu de B : remplacé par celui qui importe
  });

  test("champs personnalisés : nom, type, caractère obligatoire et choix de la liste conservés, dans le même ordre", async () => {
    const champs = await avecEntreprise(idB, (tx) => tx.select().from(contactChampPersonnalise).orderBy(contactChampPersonnalise.ordre));
    expect(champs.map((c) => c.libelle)).toEqual(["Nationalité", "Type de visa", "Rendez-vous consulaire"]);
    expect(champs.map((c) => c.type)).toEqual(["TEXTE_COURT", "LISTE_DEROULANTE", "DATE"]);
    expect(champs[1].obligatoire).toBe(true);
    expect(champs[1].options).toEqual(["Études", "Travail", "Regroupement familial"]);
  });

  test("lead et deal : statut, montant, date et contact conservés ; le deal a son premier point d'historique", async () => {
    const dansB = await avecEntreprise(idB, async (tx) => ({
      leads: await tx.select().from(lead),
      deals: await tx.select().from(deal),
      contacts: await tx.select().from(contact),
      historique: await tx.select().from(historiqueStatutDeal),
    }));
    expect(dansB.leads[0]).toMatchObject({ nom: "Paul Ateba", societeCliente: "Ateba & Fils", statut: "QUALIFIE", email: "paul@exemple.test", notes: "Visa étudiant Canada" });
    const d = dansB.deals[0];
    expect(d).toMatchObject({ titre: "Site web hôtel", montant: 1_500_000, statut: "NEGOCIATION" });
    expect(d.dateClotureEstimee?.toISOString().slice(0, 10)).toBe("2026-11-30");
    expect(dansB.contacts.find((c) => c.id === d.contactId)?.nom).toBe("Jean Mbarga");
    expect(dansB.historique.filter((h) => h.dealId === d.id)).toHaveLength(1);
  });

  test("produits : type, prix et stock conservés (un service n'a jamais de stock)", async () => {
    const produits = await avecEntreprise(idB, (tx) => tx.select().from(produit));
    const pc = produits.find((p) => p.nom === "Ordinateur portable")!;
    expect(pc).toMatchObject({ type: "BIEN", prixVente: 400_000, prixAchat: 300_000, suiviStock: true, stockActuel: 5, description: "15 pouces" });
    expect(produits.find((p) => p.nom === "Maintenance annuelle")).toMatchObject({ type: "SERVICE", prixVente: 50_000, suiviStock: false });
  });

  test("devis et facture : numéro d'origine, lignes, statut, montants et paiement conservés", async () => {
    const dansB = await avecEntreprise(idB, async (tx) => ({
      devis: await tx.select().from(devis),
      lignesDevis: await tx.select().from(ligneDevis),
      factures: await tx.select().from(facture),
      paiements: await tx.select().from(paiement),
    }));
    expect(dansB.devis).toHaveLength(1);
    expect(dansB.devis[0]).toMatchObject({ numero: `DEV-A-${suffixe}`, statut: "ACCEPTE", montantHT: 250_000, montantTVA: 48_125, montantTTC: 298_125 });
    expect(dansB.lignesDevis).toHaveLength(2);
    expect(dansB.factures).toHaveLength(1);
    expect(dansB.factures[0]).toMatchObject({ numero: `FAC-A-${suffixe}`, statut: "PARTIELLEMENT_PAYEE", montantHT: 400_000, montantTTC: 477_000 });
    expect(dansB.paiements.reduce((s, p) => s + p.montant, 0)).toBe(100_000);
  });

  test("modèle d'email repris à l'identique", async () => {
    const [mo] = await avecEntreprise(idB, (tx) => tx.select().from(modeleEmail));
    expect(mo).toMatchObject({ type: "ENVOI_DEVIS", objet: "Votre devis {{numero}}" });
    expect(mo.corps).toContain("Voici notre devis.");
  });

  test("rejouer les mêmes fichiers ne crée rien de plus (tout est reconnu comme déjà présent)", async () => {
    for (const type of ORDRE_IMPORT) {
      const { rapport } = await importer(adminB, type, fichiers[type]);
      expect(rapport.crees, `${type} rejoué`).toBe(0);
      expect(rapport.nbErreurs, type).toBe(0);
    }
  });

  test("isolation : l'import dans B n'a rien changé chez A, et A garde ses propres identifiants", async () => {
    const compteursA = await avecEntreprise(idA, (tx) => compterDonnees(tx, idA));
    expect(compteursA).toEqual({ CONTACTS: 2, LEADS: 1, DEALS: 1, PRODUITS: 2, DEVIS: 1, FACTURES: 1, CHAMPS_CONTACT: 3, MODELES_EMAIL: 1 });
    const idsA = new Set(await avecEntreprise(idA, async (tx) => (await tx.select({ id: contact.id }).from(contact)).map((c) => c.id)));
    const idsB = await avecEntreprise(idB, async (tx) => (await tx.select({ id: contact.id }).from(contact)).map((c) => c.id));
    expect(idsB.some((id) => idsA.has(id))).toBe(false);
  });

  test("le journal des exports est isolé par espace", async () => {
    await avecEntreprise(idA, (tx) => tx.insert(journalExportDonnees).values({ entrepriseId: idA, utilisateurId: adminA.utilisateurId, type: "CONTACTS", nombreLignes: 2 }));
    expect(await avecEntreprise(idB, (tx) => tx.select().from(journalExportDonnees))).toHaveLength(0);
    await expect(
      avecEntreprise(idB, (tx) => tx.insert(journalExportDonnees).values({ entrepriseId: idA, utilisateurId: adminB.utilisateurId, type: "CONTACTS", nombreLignes: 1 }))
    ).rejects.toThrow();
  });
});

describe("Lecture des statuts venus d'autres applications", () => {
  test("statuts de lead", () => {
    expect(statutLeadDepuisTexte("Qualifié")).toBe("QUALIFIE");
    expect(statutLeadDepuisTexte("Qualified")).toBe("QUALIFIE");
    expect(statutLeadDepuisTexte("Disqualifié")).toBe("DISQUALIFIE");
    expect(statutLeadDepuisTexte("Not Qualified")).toBe("DISQUALIFIE"); // jamais lu comme « qualifié »
    expect(statutLeadDepuisTexte("Non qualifié")).toBe("DISQUALIFIE");
    expect(statutLeadDepuisTexte("Statut inconnu")).toBe("NOUVEAU"); // inconnu : reste nouveau plutôt que d'être mal classé
    expect(statutLeadDepuisTexte("Contacté")).toBe("CONTACTE");
    expect(statutLeadDepuisTexte("")).toBe("NOUVEAU");
  });

  test("étapes de deal (Vertex One et Zoho CRM)", () => {
    expect(statutDealDepuisTexte("Gagné")).toBe("GAGNE");
    expect(statutDealDepuisTexte("Closed Won")).toBe("GAGNE");
    expect(statutDealDepuisTexte("Closed Lost")).toBe("PERDU");
    expect(statutDealDepuisTexte("Perdu")).toBe("PERDU");
    expect(statutDealDepuisTexte("Négociation")).toBe("NEGOCIATION");
    expect(statutDealDepuisTexte("Proposal/Price Quote")).toBe("PROPOSITION");
    expect(statutDealDepuisTexte("Needs Analysis")).toBe("QUALIFICATION");
  });
});
