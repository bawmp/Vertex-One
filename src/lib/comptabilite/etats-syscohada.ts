import type { LigneBalance } from "./etats-financiers";

/**
 * États financiers présentés par rubriques SYSCOHADA (2026-11-02, priorité 2.3) : bilan (actif en brut / amortissements / net, passif) et
 * compte de résultat avec ses soldes intermédiaires (marge commerciale, valeur ajoutée, excédent brut d'exploitation, résultat
 * d'exploitation, financier, des activités ordinaires, hors activités ordinaires, résultat net). Règles pures : elles reçoivent des soldes
 * de comptes et ne touchent pas à la base. Chaque compte tombe dans UNE rubrique, selon son numéro et le sens de son solde ; ce qui n'a
 * pas de rubrique propre atterrit dans « Autres », jamais ignoré : le total de l'actif égale toujours celui du passif quand la comptabilité
 * est équilibrée, et le résultat net égale toujours la somme des comptes 6, 7 et 8.
 *
 * C'est une présentation par rubriques adaptée au plan comptable de Vertex One, destinée à être validée par un comptable avant tout dépôt
 * officiel (voir la mention portée sur les écrans et le PDF) : pas la liasse fiscale complète (annexes, tableau des flux).
 */

export type LigneEtat = { code: string; libelle: string; brut: number; amort: number; net: number };
export type SectionEtat = { titre: string; lignes: LigneEtat[]; total: { brut: number; amort: number; net: number } };
export type Bilan = { actif: SectionEtat[]; passif: SectionEtat[]; totalActif: number; totalPassif: number; equilibre: boolean };

type Cote = "ACTIF" | "PASSIF" | "CONTRE_ACTIF";
type Regle = { test: (numero: string) => boolean; cote: Cote; rubrique: string };

const commence = (...prefixes: string[]) => (n: string) => prefixes.some((p) => n.startsWith(p));

/** Rubriques du bilan, dans l'ordre d'affichage : [clé, code, libellé, section]. */
const RUBRIQUES: { cle: string; code: string; libelle: string; section: string; cote: "ACTIF" | "PASSIF" }[] = [
  { cle: "incorp", code: "AD", libelle: "Immobilisations incorporelles", section: "Actif immobilisé", cote: "ACTIF" },
  { cle: "corp", code: "AI", libelle: "Immobilisations corporelles", section: "Actif immobilisé", cote: "ACTIF" },
  { cle: "fin", code: "AQ", libelle: "Immobilisations financières", section: "Actif immobilisé", cote: "ACTIF" },
  { cle: "stocks", code: "BB", libelle: "Stocks et encours", section: "Actif circulant", cote: "ACTIF" },
  { cle: "clients", code: "BH", libelle: "Clients et comptes rattachés", section: "Actif circulant", cote: "ACTIF" },
  { cle: "creances_fisc", code: "BI", libelle: "Créances fiscales et sociales", section: "Actif circulant", cote: "ACTIF" },
  { cle: "charges_avance", code: "BJ", libelle: "Charges constatées d'avance", section: "Actif circulant", cote: "ACTIF" },
  { cle: "autres_creances", code: "BK", libelle: "Autres créances", section: "Actif circulant", cote: "ACTIF" },
  { cle: "tresorerie_a", code: "BS", libelle: "Banques, caisse et assimilés", section: "Trésorerie-actif", cote: "ACTIF" },
  { cle: "capital", code: "CA", libelle: "Capital", section: "Capitaux propres et ressources assimilées", cote: "PASSIF" },
  { cle: "reserves", code: "CD", libelle: "Réserves et report à nouveau", section: "Capitaux propres et ressources assimilées", cote: "PASSIF" },
  { cle: "resultat", code: "CJ", libelle: "Résultat net de l'exercice", section: "Capitaux propres et ressources assimilées", cote: "PASSIF" },
  { cle: "subventions", code: "CL", libelle: "Subventions et provisions réglementées", section: "Capitaux propres et ressources assimilées", cote: "PASSIF" },
  { cle: "emprunts", code: "DA", libelle: "Emprunts et dettes financières", section: "Dettes financières et ressources assimilées", cote: "PASSIF" },
  { cle: "provisions", code: "DB", libelle: "Provisions pour risques et charges", section: "Dettes financières et ressources assimilées", cote: "PASSIF" },
  { cle: "fournisseurs", code: "DJ", libelle: "Fournisseurs et comptes rattachés", section: "Passif circulant", cote: "PASSIF" },
  { cle: "dettes_fisc", code: "DK", libelle: "Dettes fiscales et sociales", section: "Passif circulant", cote: "PASSIF" },
  { cle: "clients_avances", code: "DL", libelle: "Clients, avances reçues", section: "Passif circulant", cote: "PASSIF" },
  { cle: "produits_avance", code: "DM", libelle: "Produits constatés d'avance", section: "Passif circulant", cote: "PASSIF" },
  { cle: "autres_dettes", code: "DN", libelle: "Autres dettes", section: "Passif circulant", cote: "PASSIF" },
  { cle: "tresorerie_p", code: "DT", libelle: "Banques, découverts et assimilés", section: "Trésorerie-passif", cote: "PASSIF" },
];

/** Règles ordonnées : la première qui reconnaît le numéro l'emporte (les cas particuliers d'abord). */
const REGLES: Regle[] = [
  // Capitaux propres
  { test: commence("10"), cote: "PASSIF", rubrique: "capital" },
  { test: commence("11", "121", "122"), cote: "PASSIF", rubrique: "reserves" },
  { test: commence("120", "129", "13"), cote: "PASSIF", rubrique: "resultat" },
  { test: commence("14", "15"), cote: "PASSIF", rubrique: "subventions" },
  { test: commence("16", "17", "18"), cote: "PASSIF", rubrique: "emprunts" },
  { test: commence("19"), cote: "PASSIF", rubrique: "provisions" },
  // Actif immobilisé (le 218 du plan Vertex One est « autres immobilisations corporelles »)
  { test: commence("281", "282", "283", "284"), cote: "CONTRE_ACTIF", rubrique: "corp" },
  { test: commence("280", "290"), cote: "CONTRE_ACTIF", rubrique: "incorp" },
  { test: commence("218", "22", "23", "24"), cote: "ACTIF", rubrique: "corp" },
  { test: commence("21"), cote: "ACTIF", rubrique: "incorp" },
  { test: commence("25", "26", "27", "29"), cote: "ACTIF", rubrique: "fin" },
  // Stocks
  { test: commence("39"), cote: "CONTRE_ACTIF", rubrique: "stocks" },
  { test: commence("3"), cote: "ACTIF", rubrique: "stocks" },
  // Tiers
  { test: commence("419"), cote: "PASSIF", rubrique: "clients_avances" },
  { test: commence("41"), cote: "ACTIF", rubrique: "clients" },
  { test: commence("40"), cote: "PASSIF", rubrique: "fournisseurs" },
  { test: commence("42", "43", "44"), cote: "PASSIF", rubrique: "dettes_fisc" },
  { test: commence("476"), cote: "ACTIF", rubrique: "charges_avance" },
  { test: commence("477"), cote: "PASSIF", rubrique: "produits_avance" },
  { test: commence("45", "46", "47", "48"), cote: "PASSIF", rubrique: "autres_dettes" },
  // Trésorerie
  { test: commence("52", "56"), cote: "PASSIF", rubrique: "tresorerie_p" },
  { test: commence("5"), cote: "ACTIF", rubrique: "tresorerie_a" },
];

/** Là où atterrit un solde qui va à rebours de sa rubrique (un client créditeur, un fournisseur débiteur…). */
const REPLI_VERS_ACTIF: Record<string, string> = { fournisseurs: "autres_creances", dettes_fisc: "creances_fisc", autres_dettes: "autres_creances", tresorerie_p: "tresorerie_a", clients_avances: "autres_creances", produits_avance: "autres_creances" };
const REPLI_VERS_PASSIF: Record<string, string> = { clients: "clients_avances", creances_fisc: "dettes_fisc", charges_avance: "autres_dettes", autres_creances: "autres_dettes", tresorerie_a: "tresorerie_p", stocks: "autres_dettes", incorp: "autres_dettes", corp: "autres_dettes", fin: "autres_dettes" };

function regleDe(numero: string): Regle {
  return REGLES.find((r) => r.test(numero)) ?? { test: () => true, cote: Number(numero[0]) <= 2 ? "PASSIF" : "ACTIF", rubrique: Number(numero[0]) <= 2 ? "autres_dettes" : "autres_creances" };
}

/**
 * Bilan à partir de la balance CUMULÉE à la fin de l'exercice. Le résultat de l'exercice en cours (comptes 6, 7 et 8 non encore soldés
 * par une clôture) est ajouté à la rubrique « Résultat net » : après la clôture, ces comptes sont à zéro et le résultat vit dans 120/129.
 */
export function construireBilan(balance: LigneBalance[]): Bilan {
  const brut: Record<string, number> = {};
  const amort: Record<string, number> = {};
  const passif: Record<string, number> = {};
  const ajouter = (table: Record<string, number>, cle: string, v: number) => {
    table[cle] = (table[cle] ?? 0) + v;
  };

  for (const l of balance) {
    if (l.classe > 5 || l.solde === 0) continue;
    const r = regleDe(l.numero);
    if (r.cote === "ACTIF") {
      if (l.solde >= 0) ajouter(brut, r.rubrique, l.solde);
      else ajouter(passif, REPLI_VERS_PASSIF[r.rubrique] ?? "autres_dettes", -l.solde);
    } else if (r.cote === "CONTRE_ACTIF") {
      ajouter(amort, r.rubrique, -l.solde); // un amortissement a un solde créditeur : la valeur positive vient en déduction
    } else if (l.solde <= 0) ajouter(passif, r.rubrique, -l.solde);
    else ajouter(brut, REPLI_VERS_ACTIF[r.rubrique] ?? "autres_creances", l.solde);
  }
  // Résultat de l'exercice non encore soldé : bénéfice (produits > charges) au passif, perte en négatif.
  const gestion = balance.filter((l) => l.classe >= 6).reduce((s, l) => s + l.solde, 0);
  if (gestion !== 0) ajouter(passif, "resultat", -gestion);

  const lignePour = (cle: string, cote: "ACTIF" | "PASSIF"): LigneEtat | null => {
    const spec = RUBRIQUES.find((x) => x.cle === cle)!;
    if (cote === "ACTIF") {
      const b = brut[cle] ?? 0;
      const a = amort[cle] ?? 0;
      return b === 0 && a === 0 ? null : { code: spec.code, libelle: spec.libelle, brut: b, amort: a, net: b - a };
    }
    const v = passif[cle] ?? 0;
    return v === 0 ? null : { code: spec.code, libelle: spec.libelle, brut: v, amort: 0, net: v };
  };

  const sections = (cote: "ACTIF" | "PASSIF"): SectionEtat[] => {
    const noms = [...new Set(RUBRIQUES.filter((x) => x.cote === cote).map((x) => x.section))];
    return noms
      .map((titre) => {
        const lignes = RUBRIQUES.filter((x) => x.cote === cote && x.section === titre)
          .map((x) => lignePour(x.cle, cote))
          .filter((x): x is LigneEtat => x !== null);
        return { titre, lignes, total: { brut: lignes.reduce((s, l) => s + l.brut, 0), amort: lignes.reduce((s, l) => s + l.amort, 0), net: lignes.reduce((s, l) => s + l.net, 0) } };
      })
      .filter((s) => s.lignes.length > 0);
  };

  const actif = sections("ACTIF");
  const sectionsPassif = sections("PASSIF");
  const totalActif = actif.reduce((s, x) => s + x.total.net, 0);
  const totalPassif = sectionsPassif.reduce((s, x) => s + x.total.net, 0);
  return { actif, passif: sectionsPassif, totalActif, totalPassif, equilibre: totalActif === totalPassif };
}

/* ------------------------------ Compte de résultat ------------------------------ */

export type LigneResultat = { code: string; libelle: string; montant: number; solde: boolean };
export type CompteDeResultatSyscohada = { lignes: LigneResultat[]; resultatNet: number; chiffreAffaires: number };

type Groupe = "TA" | "RA" | "RB" | "TC" | "T_AUTRES70" | "RC" | "RE" | "RK" | "RD" | "R_AUTRES_CHARGES" | "T_AUTRES_PRODUITS" | "TF" | "RF" | "TH" | "RH";
const GROUPES: { test: (n: string) => boolean; groupe: Groupe }[] = [
  { test: commence("707"), groupe: "TA" },
  { test: commence("706"), groupe: "TC" },
  { test: commence("70"), groupe: "T_AUTRES70" },
  { test: commence("601"), groupe: "RA" },
  { test: commence("603"), groupe: "RB" },
  { test: commence("602", "604", "605", "608"), groupe: "RC" },
  { test: commence("61", "62", "63"), groupe: "RE" },
  { test: commence("64"), groupe: "RK" },
  { test: commence("66", "67"), groupe: "RF" },
  { test: commence("68", "69"), groupe: "RD" },
  { test: commence("75"), groupe: "T_AUTRES_PRODUITS" },
  { test: commence("77", "78", "79"), groupe: "TF" },
];

/** Compte de résultat à partir des soldes (mouvements) des comptes de gestion de l'exercice. Débit − crédit = `solde`. */
export function construireCompteDeResultat(gestion: LigneBalance[]): CompteDeResultatSyscohada {
  const somme: Record<Groupe, number> = { TA: 0, RA: 0, RB: 0, TC: 0, T_AUTRES70: 0, RC: 0, RE: 0, RK: 0, RD: 0, R_AUTRES_CHARGES: 0, T_AUTRES_PRODUITS: 0, TF: 0, RF: 0, TH: 0, RH: 0 };
  for (const l of gestion) {
    if (l.classe < 6 || l.solde === 0) continue;
    if (l.classe === 8) {
      if (l.solde < 0) somme.TH += -l.solde;
      else somme.RH += l.solde;
      continue;
    }
    const g = GROUPES.find((x) => x.test(l.numero))?.groupe;
    const produit = l.classe === 7;
    const valeur = produit ? -l.solde : l.solde; // produit : crédit − débit ; charge : débit − crédit
    if (g) somme[g] += valeur;
    else if (produit) somme.T_AUTRES_PRODUITS += valeur;
    else somme.R_AUTRES_CHARGES += valeur;
  }

  const xa = somme.TA - somme.RA - somme.RB;
  const chiffreAffaires = somme.TA + somme.TC + somme.T_AUTRES70;
  const xc = xa + somme.TC + somme.T_AUTRES70 + somme.T_AUTRES_PRODUITS - somme.RC - somme.RE - somme.R_AUTRES_CHARGES;
  const xd = xc - somme.RK;
  const xe = xd - somme.RD;
  const xf = somme.TF - somme.RF;
  const xg = xe + xf;
  const xh = somme.TH - somme.RH;
  const xi = xg + xh;

  const ligne = (code: string, libelle: string, montant: number, solde = false): LigneResultat => ({ code, libelle, montant, solde });
  const lignes: LigneResultat[] = [
    ligne("TA", "Ventes de marchandises", somme.TA),
    ligne("RA", "Achats de marchandises", -somme.RA),
    ligne("RB", "Variation de stocks de marchandises", -somme.RB),
    ligne("XA", "MARGE COMMERCIALE", xa, true),
    ligne("TC", "Prestations de services", somme.TC),
    ligne("TD", "Autres produits d'activité", somme.T_AUTRES70),
    ligne("XB", "CHIFFRE D'AFFAIRES", chiffreAffaires, true),
    ligne("TK", "Autres produits d'exploitation", somme.T_AUTRES_PRODUITS),
    ligne("RC", "Achats de matières et fournitures", -somme.RC),
    ligne("RE", "Services extérieurs", -somme.RE),
    ligne("RL", "Autres charges d'exploitation", -somme.R_AUTRES_CHARGES),
    ligne("XC", "VALEUR AJOUTÉE", xc, true),
    ligne("RK", "Charges de personnel", -somme.RK),
    ligne("XD", "EXCÉDENT BRUT D'EXPLOITATION", xd, true),
    ligne("RD", "Dotations aux amortissements et provisions", -somme.RD),
    ligne("XE", "RÉSULTAT D'EXPLOITATION", xe, true),
    ligne("TF", "Produits financiers", somme.TF),
    ligne("RF", "Charges financières", -somme.RF),
    ligne("XF", "RÉSULTAT FINANCIER", xf, true),
    ligne("XG", "RÉSULTAT DES ACTIVITÉS ORDINAIRES", xg, true),
    ligne("TH", "Produits hors activités ordinaires", somme.TH),
    ligne("RH", "Charges hors activités ordinaires", -somme.RH),
    ligne("XH", "RÉSULTAT HORS ACTIVITÉS ORDINAIRES", xh, true),
    ligne("XI", "RÉSULTAT NET", xi, true),
  ];
  // Seules les lignes qui portent un montant (ou un solde intermédiaire) s'affichent : une entreprise de services n'a pas de « Ventes de marchandises ».
  // Aucun mouvement de gestion : pas de tableau de zéros.
  if (lignes.every((l) => l.montant === 0)) return { lignes: [], resultatNet: 0, chiffreAffaires: 0 };
  return { lignes: lignes.filter((l) => l.solde || l.montant !== 0), resultatNet: xi, chiffreAffaires };
}
