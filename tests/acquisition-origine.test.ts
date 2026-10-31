import { describe, expect, it } from "vitest";
import { lireOrigine, nettoyerOrigine, origineDepuisNavigation, serialiserOrigine, ORIGINE_DIRECTE } from "@/lib/acquisition/origine";
import {
  OBJECTIF_PAYANTS,
  essaisARelancer,
  parCampagne,
  parOrigine,
  parParrain,
  synthese,
  type LigneAcquisition,
} from "@/lib/acquisition/stats";

const JOUR = 86_400_000;
const MAINTENANT = new Date("2026-12-10T10:00:00Z");
const ilYa = (jours: number) => new Date(MAINTENANT.getTime() - jours * JOUR);
const dans = (jours: number) => new Date(MAINTENANT.getTime() + jours * JOUR);

function ligne(extra: Partial<LigneAcquisition> & { id: string }): LigneAcquisition {
  const creeLe = extra.creeLe ?? ilYa(2);
  return {
    nom: `Entreprise ${extra.id}`,
    secteur: "agence",
    creeLe,
    essaiFinLe: new Date(creeLe.getTime() + 14 * JOUR),
    echeanceLe: new Date(creeLe.getTime() + 14 * JOUR),
    origineSource: null,
    origineCampagne: null,
    origineParrain: null,
    adminNom: "Admin",
    adminEmail: `${extra.id}@exemple.test`,
    nbContacts: 0,
    nbFactures: 0,
    premiereFactureLe: null,
    nbPaiementsClients: 0,
    payant: false,
    dernierMontant: null,
    dernierMois: null,
    ...extra,
  };
}

describe("Origine d'une inscription — lecture des liens de campagne", () => {
  it("lit utm_source / utm_medium / utm_campaign et les nettoie", () => {
    const { origine, explicite } = origineDepuisNavigation("?utm_source=Facebook&utm_medium=Pub&utm_campaign=Mobilité-Nov", "", "vertexone.cm");
    expect(explicite).toBe(true);
    expect(origine).toEqual({ source: "facebook", support: "pub", campagne: "mobilite-nov", parrain: null });
  });

  it("un code de parrainage (?ref=) sans source devient « parrainage »", () => {
    const { origine } = origineDepuisNavigation("?ref=Cabinet-Ngono", "", "vertexone.cm");
    expect(origine).toEqual({ source: "parrainage", support: null, campagne: null, parrain: "cabinet-ngono" });
  });

  it("sans paramètre, le référent donne la source ; le propre site ou l'absence de référent donnent « direct »", () => {
    expect(origineDepuisNavigation("", "https://l.facebook.com/x", "vertexone.cm")).toEqual({ origine: { ...ORIGINE_DIRECTE, source: "facebook" }, explicite: false });
    expect(origineDepuisNavigation("", "https://www.google.com/search?q=x", "vertexone.cm").origine.source).toBe("google");
    expect(origineDepuisNavigation("", "https://wa.me/237600000000", "vertexone.cm").origine.source).toBe("whatsapp");
    expect(origineDepuisNavigation("", "https://blog-inconnu.example/", "vertexone.cm").origine.source).toBe("autre");
    expect(origineDepuisNavigation("", "https://vertexone.cm/tarifs", "vertexone.cm").origine.source).toBe("direct");
    expect(origineDepuisNavigation("", "", "vertexone.cm").origine).toEqual(ORIGINE_DIRECTE);
    expect(origineDepuisNavigation("", "pas une adresse", "vertexone.cm").origine).toEqual(ORIGINE_DIRECTE);
  });

  it("une valeur hostile est neutralisée : jamais de guillemet, de chevron, de point-virgule ni de « | » dans ce qui est stocké", () => {
    expect(nettoyerOrigine("<script>alert(1)</script>")).toBe("scriptalert1script");
    expect(nettoyerOrigine("a'; drop table entreprise;--")).toBe("adroptableentreprise--");
    expect(nettoyerOrigine("x".repeat(500))).toHaveLength(60);
    expect(nettoyerOrigine("   ")).toBeNull();
    expect(nettoyerOrigine(42)).toBeNull();
    const aller = serialiserOrigine({ source: "fb", support: "a|b", campagne: null, parrain: null } as never);
    expect(lireOrigine(aller)?.source).toBe("fb");
    expect(lireOrigine("ev<il>|sup'port|c;amp|p\"ar")).toEqual({ source: "evil", support: "support", campagne: "camp", parrain: "par" });
    expect(lireOrigine("")).toBeNull();
    expect(lireOrigine("|||")).toBeNull();
    expect(lireOrigine(undefined)).toBeNull();
  });

  it("le cookie se relit à l'identique après sérialisation", () => {
    const o = { source: "facebook", support: "pub", campagne: "mobilite-nov", parrain: null };
    expect(lireOrigine(encodeURIComponent(serialiserOrigine(o)))).toEqual(o);
  });
});

describe("Indicateurs d'acquisition", () => {
  const lignes = [
    // payant (annuel, encore en cours) — venu de Facebook
    ligne({ id: "p1", creeLe: ilYa(30), origineSource: "facebook", origineCampagne: "mobilite-nov", payant: true, dernierMontant: 250_000, dernierMois: 12, echeanceLe: dans(300), nbFactures: 3, premiereFactureLe: ilYa(28), nbContacts: 10 }),
    // payant mensuel, abonnement échu → ne compte pas dans le revenu mensuel réel
    ligne({ id: "p2", creeLe: ilYa(60), origineSource: "parrainage", origineParrain: "cabinet-ngono", payant: true, dernierMontant: 25_000, dernierMois: 1, echeanceLe: ilYa(5), nbFactures: 1, premiereFactureLe: ilYa(58) }),
    // essai terminé sans paiement
    ligne({ id: "t1", creeLe: ilYa(20), origineSource: "facebook", origineCampagne: "mobilite-nov", nbContacts: 2 }),
    // essai en cours, activé (facture à J1)
    ligne({ id: "e1", creeLe: ilYa(9), origineSource: "reseau", nbContacts: 5, nbFactures: 2, premiereFactureLe: ilYa(8), nbPaiementsClients: 1 }),
    // essai en cours, jamais facturé, inscrit avant le suivi d'origine
    ligne({ id: "e2", creeLe: ilYa(4) }),
    // essai très récent
    ligne({ id: "e3", creeLe: ilYa(0), origineSource: "direct" }),
  ];

  it("synthèse : inscrits, essais en cours, payants, revenu mensuel réel, conversion, activation, objectif", () => {
    const s = synthese(lignes, MAINTENANT);
    expect(s.total).toBe(6);
    expect(s.inscrits7j).toBe(2); // e2 (4 j) et e3 (0 j)
    expect(s.inscrits30j).toBe(4); // t1, e1, e2, e3 (p1 est à 30 jours pile : exclu ; p2 à 60 jours)
    expect(s.essaisEnCours).toBe(3); // e1, e2, e3
    expect(s.payants).toBe(2);
    expect(s.mrr).toBe(Math.round(250_000 / 12)); // p2 est échu : pas de revenu mensuel
    expect(s.conversionEssai).toBeCloseTo(2 / 3); // 2 payants sur (2 payants + t1 terminé sans payer)
    expect(s.activation.eligibles).toBe(4); // p1, p2, t1, e1 (inscrits depuis ≥ 7 jours)
    expect(s.activation.activees).toBe(3); // p1, p2, e1 ont facturé dans les 7 jours
    expect(s.activation.taux).toBeCloseTo(3 / 4);
    expect(s.objectif).toEqual({ cible: OBJECTIF_PAYANTS, atteint: 2, reste: 8 });
  });

  it("sans donnée : aucun taux inventé (null), jamais NaN", () => {
    const s = synthese([], MAINTENANT);
    expect(s).toMatchObject({ total: 0, payants: 0, mrr: 0, conversionEssai: null });
    expect(s.activation.taux).toBeNull();
  });

  it("par origine : les inscriptions d'avant le suivi sont « inconnue » (jamais « direct »), triées par payants puis inscrits", () => {
    const g = parOrigine(lignes);
    expect(g.find((x) => x.cle === "inconnue")?.inscrits).toBe(1);
    expect(g[0].cle).toBe("facebook");
    expect(g[0]).toMatchObject({ inscrits: 2, payants: 1, avecFacture: 1 });
  });

  it("par campagne et par parrain : seulement les inscriptions qui en portent", () => {
    expect(parCampagne(lignes)).toEqual([expect.objectContaining({ cle: "facebook / mobilite-nov", inscrits: 2, payants: 1 })]);
    expect(parParrain(lignes)).toEqual([expect.objectContaining({ cle: "cabinet-ngono", inscrits: 1, payants: 1 })]);
  });

  it("essais à relancer : le plan jour 1 / jour 3 / jour 7 / fin d'essai, les plus urgents d'abord, les payants jamais listés", () => {
    const essais = [
      ligne({ id: "a", creeLe: ilYa(1), nbContacts: 0 }), // jour 1, aucun contact
      ligne({ id: "b", creeLe: ilYa(4), nbContacts: 3, nbFactures: 0 }), // jour 4, aucune facture
      ligne({ id: "c", creeLe: ilYa(8), nbContacts: 3, nbFactures: 2, premiereFactureLe: ilYa(7), nbPaiementsClients: 0 }), // jour 8, pas de paiement client
      ligne({ id: "d", creeLe: ilYa(12), nbContacts: 3, nbFactures: 2, premiereFactureLe: ilYa(11), nbPaiementsClients: 1 }), // fin dans 2 jours
      ligne({ id: "e", creeLe: ilYa(16), nbContacts: 3 }), // essai terminé il y a 2 jours
      ligne({ id: "f", creeLe: ilYa(5), nbContacts: 4, nbFactures: 1, premiereFactureLe: ilYa(4), nbPaiementsClients: 1 }), // en bonne voie
      ligne({ id: "g", creeLe: ilYa(40), payant: true }), // payant : jamais listé
      ligne({ id: "h", creeLe: ilYa(40) }), // essai terminé depuis longtemps : plus listé
    ];
    const r = essaisARelancer(essais, MAINTENANT);
    expect(r.map((x) => x.id)).toEqual(["e", "d", "c", "b", "a", "f"]);
    expect(r.find((x) => x.id === "e")?.action).toMatch(/Essai terminé/);
    expect(r.find((x) => x.id === "c")?.action).toMatch(/Jour 7/);
    expect(r.find((x) => x.id === "d")?.action).toMatch(/bientôt fini/);
    expect(r.find((x) => x.id === "b")?.action).toMatch(/Jour 3/);
    expect(r.find((x) => x.id === "a")?.action).toMatch(/Jour 1/);
    expect(r.find((x) => x.id === "f")?.action).toBeNull();
  });
});
