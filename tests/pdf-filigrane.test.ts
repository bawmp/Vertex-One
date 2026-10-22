import { describe, test, expect, vi } from "vitest";
import { inflateSync } from "node:zlib";

vi.mock("server-only", () => ({}));

import { rendreDocumentCommercialPDF } from "@/lib/pdf/rendu";

/**
 * Le logo de l'entreprise est placé en filigrane sur chaque page des documents de vente (devis, facture, bon de
 * commande, reçu, facture d'acompte) ; sans logo, ou si on le désactive, le document est inchangé.
 * Le logo de test est un PNG intégré (aucun réseau).
 */
const PNG_ROUGE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const base = {
  typeDocument: "DEVIS" as const,
  numero: "DEV-TEST-0001",
  dateEmission: new Date("2026-10-22"),
  dateEcheanceOuValidite: new Date("2026-11-22"),
  labelDateSecondaire: "Valable jusqu'au",
  client: { nom: "Client Test", societeCliente: null, niu: null, telephone: "690000000", email: null },
  // assez de lignes pour passer sur deux pages : le filigrane doit être répété
  lignes: Array.from({ length: 60 }, (_, i) => ({ designation: `Prestation ${i + 1}`, quantite: 1, prixUnitaire: 1000, tauxTVA: 0 })),
  montantHT: 60000,
  montantTVA: 0,
  montantTTC: 60000,
};
const entreprise = { nom: "Entreprise Test", niu: null, rccm: null, adresse: null, ville: null, assujettiTVA: false };

function nombreDePages(pdf: Buffer): number {
  return (pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;
}

/** Nombre d'affichages d'image (opérateur `Do`) dans le contenu des pages, flux décompressés : une image réutilisée sur deux pages en compte deux. */
function affichagesDImages(pdf: Buffer): number {
  const brut = pdf.toString("latin1");
  let total = 0;
  for (const m of brut.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    try {
      total += (inflateSync(Buffer.from(m[1], "latin1")).toString("latin1").match(/\/\w+\s+Do\b/g) ?? []).length;
    } catch {
      // flux qui n'est pas compressé (image, police) : ignoré
    }
  }
  return total;
}

describe("PDF — logo en filigrane", () => {
  test("le logo est ajouté en filigrane sur chaque page quand l'entreprise en a un", async () => {
    const avec = await rendreDocumentCommercialPDF({ ...base, entreprise: { ...entreprise, logoUrl: PNG_ROUGE } });
    const sans = await rendreDocumentCommercialPDF({ ...base, entreprise: { ...entreprise, logoUrl: PNG_ROUGE }, filigrane: false });
    expect(avec.subarray(0, 4).toString()).toBe("%PDF");
    const pages = nombreDePages(avec);
    expect(pages).toBeGreaterThan(1);
    // au moins un affichage de logo de plus par page que sans filigrane
    expect(affichagesDImages(avec) - affichagesDImages(sans)).toBeGreaterThanOrEqual(pages);
  }, 60_000);

  test("sans logo, aucun filigrane n'est ajouté", async () => {
    const sansLogo = await rendreDocumentCommercialPDF({ ...base, entreprise: { ...entreprise, logoUrl: null } });
    const sansLogoNiFiligrane = await rendreDocumentCommercialPDF({ ...base, entreprise: { ...entreprise, logoUrl: null }, filigrane: false });
    expect(affichagesDImages(sansLogo)).toBe(affichagesDImages(sansLogoNiFiligrane));
  }, 60_000);
});
