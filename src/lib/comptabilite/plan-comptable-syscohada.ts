// Palier 4, section 4 — "à importer comme données de référence depuis la
// nomenclature officielle plutôt que ressaisi à la main ici." La nomenclature
// SYSCOHADA complète compte plusieurs centaines de comptes ; ce fichier en
// importe un sous-ensemble réaliste et suffisant pour une PME de services
// camerounaise (les comptes réellement mobilisés par la génération
// automatique d'écritures, section 4, plus les comptes courants d'usage
// quotidien) — pas la nomenclature intégrale, qu'une entreprise ayant des
// besoins comptables plus spécifiques (immobilisations détaillées, stocks
// multiples...) complètera au besoin.
export const PLAN_COMPTABLE_SYSCOHADA: { numero: string; libelle: string; classe: number }[] = [
  // Classe 1 — Comptes de ressources durables
  { numero: "101000", libelle: "Capital social", classe: 1 },
  { numero: "120000", libelle: "Résultat net de l'exercice (bénéfice)", classe: 1 },
  { numero: "129000", libelle: "Résultat net de l'exercice (perte)", classe: 1 },
  { numero: "161000", libelle: "Emprunts et dettes assimilées", classe: 1 },

  // Classe 2 — Comptes d'actif immobilisé
  { numero: "218000", libelle: "Autres immobilisations corporelles (matériel, mobilier)", classe: 2 },
  { numero: "281800", libelle: "Amortissements des autres immobilisations corporelles", classe: 2 },

  // Classe 3 — Comptes de stocks
  { numero: "311000", libelle: "Marchandises", classe: 3 },

  // Classe 4 — Comptes de tiers
  { numero: "401000", libelle: "Fournisseurs", classe: 4 },
  { numero: "411000", libelle: "Clients", classe: 4 },
  // Ajouté pour les Factures d'acompte (Retainer Invoices, échange du
  // 2026-09-07) : une avance encaissée avant livraison n'est jamais du
  // chiffre d'affaires ni une créance client, mais une dette envers le
  // client tant qu'elle n'a pas été appliquée sur une vraie Facture — voir
  // genererEcrituresPaiementAcompte()/genererEcrituresApplicationAcompte().
  { numero: "419100", libelle: "Clients, avances et acomptes reçus", classe: 4 },
  { numero: "421000", libelle: "Personnel, avances et acomptes", classe: 4 },
  { numero: "422000", libelle: "Personnel, rémunérations dues", classe: 4 },
  { numero: "431000", libelle: "Sécurité sociale (CNPS)", classe: 4 },
  { numero: "441000", libelle: "État, impôts sur les bénéfices", classe: 4 },
  { numero: "443200", libelle: "État, TVA facturée", classe: 4 },
  { numero: "445200", libelle: "État, TVA récupérable", classe: 4 },
  { numero: "447000", libelle: "État, autres impôts et taxes", classe: 4 },

  // Classe 5 — Comptes de trésorerie
  { numero: "512000", libelle: "Banques", classe: 5 },
  { numero: "571000", libelle: "Caisse", classe: 5 },
  { numero: "585000", libelle: "Virements de fonds", classe: 5 },

  // Classe 6 — Comptes de charges
  { numero: "601000", libelle: "Achats de marchandises", classe: 6 },
  { numero: "604000", libelle: "Achats stockés de matières et fournitures", classe: 6 },
  { numero: "605000", libelle: "Autres achats", classe: 6 },
  { numero: "622000", libelle: "Locations et charges locatives", classe: 6 },
  { numero: "624000", libelle: "Entretien, réparations et maintenance", classe: 6 },
  { numero: "628000", libelle: "Autres charges externes", classe: 6 },
  { numero: "641000", libelle: "Rémunérations directes versées au personnel national", classe: 6 },
  { numero: "645000", libelle: "Charges sociales (CNPS)", classe: 6 },
  { numero: "661000", libelle: "Charges d'intérêts", classe: 6 },
  { numero: "681000", libelle: "Dotations aux amortissements", classe: 6 },

  // Classe 7 — Comptes de produits
  { numero: "706000", libelle: "Prestations de services", classe: 7 },
  { numero: "707000", libelle: "Ventes de marchandises", classe: 7 },
  { numero: "758000", libelle: "Produits divers", classe: 7 },
  { numero: "776000", libelle: "Gains de change", classe: 7 },
];
