import { describe, test, expect } from "vitest";
import { lireCsv, detecterSeparateur } from "@/lib/import/csv";
import { booleen, date, decimal, montant, normaliser } from "@/lib/import/valeurs";
import { lireTableau, NB_MAX_LIGNES_IMPORT, versTableau } from "@/lib/import/fichier";
import { assainirCorrespondance, DEFINITIONS, proposerCorrespondance } from "@/lib/import/definitions";
import { statutDepuisLigne } from "@/lib/import/moteur/projets-taches";
import { statutDevisDepuisTexte, statutFactureDepuisTexte } from "@/lib/import/moteur/documents";

const fichier = (nom: string, contenu: string | Uint8Array) => new File([contenu as BlobPart], nom);

describe("Import — lecture CSV", () => {
  test("guillemets, guillemets doublés, saut de ligne dans une cellule, BOM et CRLF", () => {
    const csv = '﻿Nom,Notes\r\n"Dupont, Jean","Il a dit ""oui""\nsur deux lignes"\r\nMarie,ok\r\n';
    expect(lireCsv(csv)).toEqual([
      ["Nom", "Notes"],
      ["Dupont, Jean", 'Il a dit "oui"\nsur deux lignes'],
      ["Marie", "ok"],
    ]);
  });

  test("détecte le point-virgule (Excel en français) et la tabulation, en ignorant ce qui est entre guillemets", () => {
    expect(detecterSeparateur("Nom;Téléphone;Ville")).toBe(";");
    expect(detecterSeparateur("Nom\tEmail")).toBe("\t");
    expect(detecterSeparateur('"Nom, prénom",Email')).toBe(",");
    expect(lireCsv("a;b\n1;2")).toEqual([["a", "b"], ["1", "2"]]);
  });

  test("ignore les lignes entièrement vides", () => {
    expect(lireCsv("a,b\n\n1,2\n,\n")).toEqual([["a", "b"], ["1", "2"]]);
  });
});

describe("Import — valeurs", () => {
  test("montants en francs CFA : espaces, séparateurs de milliers, décimales, symbole monétaire", () => {
    expect(montant("15 000")).toBe(15000);
    expect(montant("15000,00")).toBe(15000);
    expect(montant("15,000.50")).toBe(15001);
    expect(montant("1,500")).toBe(1500);
    expect(montant("2 500 FCFA")).toBe(2500);
    expect(montant("XAF 1.234.567")).toBe(1234567);
    expect(montant("")).toBeNull();
    expect(montant("abc")).toBeNull();
    expect(montant(undefined)).toBeNull();
  });

  test("décimaux, dates (ISO, français, ambigu), booléens, normalisation", () => {
    expect(decimal("19,25 %")).toBe(19.25);
    expect(decimal("2")).toBe(2);
    expect(decimal("")).toBeNull();
    expect(date("2026-03-25")?.toISOString().slice(0, 10)).toBe("2026-03-25");
    expect(date("25/03/2026")?.toISOString().slice(0, 10)).toBe("2026-03-25");
    expect(date("03/25/2026")?.toISOString().slice(0, 10)).toBe("2026-03-25"); // ne peut être que mois/jour
    expect(date("05/03/2026")?.toISOString().slice(0, 10)).toBe("2026-03-05"); // ambigu : lecture française
    expect(date("2026-03-25T10:00:00Z")?.toISOString().slice(0, 10)).toBe("2026-03-25");
    expect(date("31/02/2026")).toBeNull();
    expect(date("hier")).toBeNull();
    expect(booleen("Oui")).toBe(true);
    expect(booleen("TRUE")).toBe(true);
    expect(booleen("non")).toBe(false);
    expect(normaliser("  Numéro de Téléphone !")).toBe("numero de telephone");
  });
});

describe("Import — lecture de fichiers", () => {
  test("CSV UTF-8 : première ligne = en-têtes, colonnes en double renommées", async () => {
    const lecture = await lireTableau(fichier("clients.csv", "Nom,Nom,Email\nAlice,A2,a@x.cm\n"));
    expect(lecture.ok && lecture.entetes).toEqual(["Nom", "Nom (2)", "Email"]);
    expect(lecture.ok && lecture.lignes[0]).toEqual({ Nom: "Alice", "Nom (2)": "A2", Email: "a@x.cm" });
  });

  test("CSV windows-1252 (export Excel de Windows) : les accents sont conservés", async () => {
    // « Prénom;Société\nÉlodie;Café » encodé en windows-1252 (é = 0xE9, É = 0xC9).
    const octets = Uint8Array.from([0x50, 0x72, 0xe9, 0x6e, 0x6f, 0x6d, 0x3b, 0x53, 0x6f, 0x63, 0x69, 0xe9, 0x74, 0xe9, 0x0a, 0xc9, 0x6c, 0x6f, 0x64, 0x69, 0x65, 0x3b, 0x43, 0x61, 0x66, 0xe9]);
    const lecture = await lireTableau(fichier("export.csv", octets));
    expect(lecture.ok && lecture.entetes).toEqual(["Prénom", "Société"]);
    expect(lecture.ok && lecture.lignes[0]).toEqual({ Prénom: "Élodie", Société: "Café" });
  });

  test("classeur Excel .xlsx : première feuille, dates en texte ISO, formules lues par leur valeur", async () => {
    const ExcelJS = (await import("exceljs")).default;
    const classeur = new ExcelJS.Workbook();
    const feuille = classeur.addWorksheet("Contacts");
    feuille.addRow(["Nom", "Téléphone", "Créé le"]);
    feuille.addRow(["Alice", 690111222, new Date(Date.UTC(2026, 2, 25))]);
    const tampon = await classeur.xlsx.writeBuffer();
    const lecture = await lireTableau(fichier("contacts.xlsx", new Uint8Array(tampon as ArrayBuffer)));
    expect(lecture.ok && lecture.lignes[0]).toEqual({ Nom: "Alice", Téléphone: "690111222", "Créé le": "2026-03-25" });
  });

  test("refus explicites : vide, ancien .xls, binaire, en-têtes seuls, trop de lignes", async () => {
    expect((await lireTableau(fichier("v.csv", ""))).ok).toBe(false);
    const ancien = await lireTableau(fichier("ancien.xls", Uint8Array.from([0xd0, 0xcf, 0x11, 0xe0, 1, 2, 3])));
    expect(!ancien.ok && ancien.erreur).toContain(".xlsx");
    expect((await lireTableau(fichier("x.csv", Uint8Array.from([65, 0, 66, 0, 10, 67])))).ok).toBe(false);
    expect((await lireTableau(fichier("seuls.csv", "Nom,Email\n"))).ok).toBe(false);
    const enorme = versTableau([["a"], ...Array.from({ length: NB_MAX_LIGNES_IMPORT + 1 }, (_, i) => [String(i)])]);
    expect(!enorme.ok && enorme.valeurs?.max).toBe(NB_MAX_LIGNES_IMPORT);
  });
});

describe("Import — association automatique des colonnes", () => {
  test("export Zoho CRM (contacts)", () => {
    const c = proposerCorrespondance(["First Name", "Last Name", "Account Name", "Email", "Phone", "Mobile", "Title", "Description", "Contact Owner"], DEFINITIONS.CONTACTS.champs);
    expect(c).toMatchObject({ prenom: "First Name", nom: "Last Name", entreprise: "Account Name", email: "Email", telephone: "Phone", fonction: "Title", notes: "Description", proprietaire: "Contact Owner" });
    expect(Object.values(c)).not.toContain("Mobile"); // « Phone » déjà pris : jamais deux champs sur la même colonne, et Mobile reste libre
  });

  test("export Asana (tâches)", () => {
    const c = proposerCorrespondance(
      ["Task ID", "Created At", "Completed At", "Name", "Section/Column", "Assignee", "Assignee Email", "Start Date", "Due Date", "Tags", "Notes", "Projects", "Parent task"],
      DEFINITIONS.PROJETS_TACHES.champs
    );
    expect(c).toMatchObject({ titre: "Name", projet: "Projects", section: "Section/Column", terminee: "Completed At", assigne: "Assignee", assigneEmail: "Assignee Email", echeance: "Due Date", debut: "Start Date", notes: "Notes", parent: "Parent task" });
  });

  test("export Zoho Books (factures, une ligne par article) et articles", () => {
    const f = proposerCorrespondance(["Invoice Date", "Invoice Number", "Invoice Status", "Customer Name", "Due Date", "Item Name", "Quantity", "Item Price", "Item Tax %", "Total"], DEFINITIONS.FACTURES.champs);
    expect(f).toMatchObject({ numero: "Invoice Number", client: "Customer Name", date: "Invoice Date", echeance: "Due Date", statut: "Invoice Status", designation: "Item Name", quantite: "Quantity", prixUnitaire: "Item Price", tauxTVA: "Item Tax %", totalTTC: "Total" });
    const p = proposerCorrespondance(["Item Name", "Description", "Rate", "Purchase Rate", "Item Type", "Stock On Hand"], DEFINITIONS.PRODUITS.champs);
    expect(p).toMatchObject({ nom: "Item Name", prixVente: "Rate", prixAchat: "Purchase Rate", type: "Item Type", stock: "Stock On Hand" });
  });

  test("une association reçue du navigateur est assainie : champs et colonnes inconnus écartés", () => {
    const propre = assainirCorrespondance({ nom: "Nom", inconnu: "Nom", email: "Colonne absente", telephone: 42 }, DEFINITIONS.CONTACTS.champs, ["Nom", "Email"]);
    expect(propre).toEqual({ nom: "Nom" });
    expect(assainirCorrespondance(null, DEFINITIONS.CONTACTS.champs, [])).toEqual({});
  });
});

describe("Import — statuts déduits", () => {
  test("tâches : la date de fin prime, sinon le nom de la colonne", () => {
    expect(statutDepuisLigne({ terminee: "2026-03-01" }).statut).toBe("TERMINEE");
    expect(statutDepuisLigne({ terminee: "2026-03-01" }).termineeLe?.toISOString().slice(0, 10)).toBe("2026-03-01");
    expect(statutDepuisLigne({ terminee: "" , section: "Done" }).statut).toBe("TERMINEE");
    expect(statutDepuisLigne({ section: "In progress" }).statut).toBe("EN_COURS");
    expect(statutDepuisLigne({ section: "En cours" }).statut).toBe("EN_COURS");
    expect(statutDepuisLigne({ section: "Backlog" }).statut).toBe("A_FAIRE");
    expect(statutDepuisLigne({ terminee: "non" }).statut).toBe("A_FAIRE");
  });

  test("factures : payée, annulée, en retard, brouillon écarté, impayée reste émise", () => {
    expect(statutFactureDepuisTexte("Paid")).toBe("PAYEE");
    expect(statutFactureDepuisTexte("Payée")).toBe("PAYEE");
    expect(statutFactureDepuisTexte("Unpaid")).toBe("EMISE");
    expect(statutFactureDepuisTexte("Sent")).toBe("EMISE");
    expect(statutFactureDepuisTexte("Overdue")).toBe("EN_RETARD");
    expect(statutFactureDepuisTexte("Void")).toBe("ANNULEE");
    expect(statutFactureDepuisTexte("Partially Paid")).toBe("PARTIELLEMENT_PAYEE");
    expect(statutFactureDepuisTexte("Draft")).toBeNull();
  });

  test("devis : accepté, refusé, expiré, brouillon, envoyé par défaut", () => {
    expect(statutDevisDepuisTexte("Accepted")).toBe("ACCEPTE");
    expect(statutDevisDepuisTexte("Declined")).toBe("REFUSE");
    expect(statutDevisDepuisTexte("Expired")).toBe("EXPIRE");
    expect(statutDevisDepuisTexte("Draft")).toBe("BROUILLON");
    expect(statutDevisDepuisTexte("Sent")).toBe("ENVOYE");
    expect(statutDevisDepuisTexte(undefined)).toBe("ENVOYE");
  });
});
