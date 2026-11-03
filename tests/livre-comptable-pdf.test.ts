import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { LivreComptablePDF, colonnesMontant, montantLisible, poidsColonnes } from "@/lib/pdf/livre-comptable";
import { csvBalance, csvGrandLivre } from "@/lib/comptabilite/livres-export";

describe("PDF des livres comptables", () => {
  it("détecte les colonnes de montants, jamais le numéro de compte", () => {
    const e = ["Compte", "Intitulé", "Date", "Débit", "Crédit"];
    const l = [["411000", "Clients", "01/01/26", "1190", ""], ["701000", "Ventes", "01/01/26", "", "1000"]];
    expect(colonnesMontant(e, l)).toEqual([false, false, false, true, true]);
  });

  it("sépare les milliers et garde le signe", () => {
    expect(montantLisible("1234567")).toBe("1 234 567");
    expect(montantLisible("-5000")).toBe("-5 000");
    expect(montantLisible("999")).toBe("999");
    expect(montantLisible("Total")).toBe("Total");
  });

  it("donne plus de place aux libellés qu'aux montants", () => {
    const p = poidsColonnes(["Compte", "Libellé", "Débit"], [false, false, true]);
    expect(p[1]).toBeGreaterThan(p[2]);
  });

  it("produit un vrai PDF depuis un tableau d'export, même vide", async () => {
    const t = csvBalance({ lignes: [], totaux: { ouvertureDebit: 0, ouvertureCredit: 0, mouvementDebit: 0, mouvementCredit: 0, clotureDebit: 0, clotureCredit: 0 } } as never);
    const pdf = await renderToBuffer(createElement(LivreComptablePDF as never, { titre: "Balance", entreprise: { nom: "TEST SARL", niu: null }, periode: "Du 01/01/2026 au 31/12/2026", entetes: t.entetes, lignes: t.lignes, genereLe: new Date() } as never) as never);
    expect(Buffer.from(pdf).subarray(0, 4).toString()).toBe("%PDF");
    const g = csvGrandLivre([]);
    expect(g.lignes).toEqual([]);
  });
});
