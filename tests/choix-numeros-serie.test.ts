import { describe, expect, it } from "vitest";
import { numerosAVendreAvecChoix } from "@/lib/produits/series-regles";

const jour = (n: number) => new Date(2026, 0, n);
const stock = [
  { numero: "A1", entreLe: jour(1) },
  { numero: "A2", entreLe: jour(2) },
  { numero: "A3", entreLe: jour(3) },
];

describe("choix des numéros de série à la vente", () => {
  it("prend d'abord les numéros choisis, puis complète par les plus anciens", () => {
    expect(numerosAVendreAvecChoix(stock, 2, ["A3"]).map((x) => x.numero)).toEqual(["A3", "A1"]);
  });
  it("sans choix, les plus anciens partent d'abord", () => {
    expect(numerosAVendreAvecChoix(stock, 2, []).map((x) => x.numero)).toEqual(["A1", "A2"]);
  });
  it("ne vend jamais un numéro absent du stock et ne dépasse pas la quantité", () => {
    expect(numerosAVendreAvecChoix(stock, 1, ["ZZ", "A2", "A3"]).map((x) => x.numero)).toEqual(["A2"]);
    expect(numerosAVendreAvecChoix(stock, 1, ["ZZ"]).map((x) => x.numero)).toEqual(["A1"]);
  });
});
