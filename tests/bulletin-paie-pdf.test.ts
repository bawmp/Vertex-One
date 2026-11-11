import { createElement } from "react";
import { writeFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { renderToBuffer } from "@react-pdf/renderer";
import { BulletinPaiePDF, type BulletinPDFProps } from "@/lib/pdf/bulletin-paie";

const entreprise: BulletinPDFProps["entreprise"] = { nom: "TEST Agence", logoUrl: null, couleurMarque: null, adresse: "12 rue des Palmiers", ville: "Douala", niu: "M012345678901A", rccm: "RC/DLA/2020/B/1234" };
const bulletin: BulletinPDFProps["bulletin"] = {
  reference: "BP-2026-11-ABC123",
  moisLibelle: "Novembre 2026",
  employeNom: "Linda Mbella",
  poste: "Comptable",
  dateEmbauche: "2025-01-06",
  datePaiement: "2026-11-05",
  modePaiementLibelle: "Mobile Money",
  salaireBase: 300_000,
  primes: [{ libelle: "Rendement", montant: 20_000, motif: "Objectifs atteints" }],
  totalPrimes: 20_000,
  retenues: [{ libelle: "Avance sur salaire", montant: 50_000 }],
  totalRetenues: 50_000,
  net: 270_000,
};

describe("PDF du bulletin de paie", () => {
  it("se génère avec primes et retenues", async () => {
    const buf = await renderToBuffer(createElement(BulletinPaiePDF, { entreprise, bulletin }) as Parameters<typeof renderToBuffer>[0]);
    expect(buf.subarray(0, 4).toString()).toBe("%PDF");
    if (process.env.SORTIE_BULLETIN) writeFileSync(process.env.SORTIE_BULLETIN, buf);
  });

  it("se génère sans prime ni retenue, sans coordonnées", async () => {
    const buf = await renderToBuffer(
      createElement(BulletinPaiePDF, { entreprise: { nom: "TEST Sobre", logoUrl: null, couleurMarque: "#aa3300", adresse: null, ville: null, niu: null, rccm: null }, bulletin: { ...bulletin, poste: null, dateEmbauche: null, primes: [], totalPrimes: 0, retenues: [], totalRetenues: 0, net: 300_000 } }) as Parameters<typeof renderToBuffer>[0],
    );
    expect(buf.subarray(0, 4).toString()).toBe("%PDF");
  });
});
