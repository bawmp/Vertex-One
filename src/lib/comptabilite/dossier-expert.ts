import { createElement } from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { asc, eq } from "drizzle-orm";
import type { TransactionDrizzle } from "@/db/client";
import { compteComptable, entreprise } from "@/db/schema";
import { ecrireCsv } from "@/lib/export/csv";
import { creerZip, type FichierZip } from "@/lib/export/zip";
import { calculerBalance, calculerBilan, calculerCompteDeResultat, type LigneBalance } from "./etats-financiers";
import { lignesExerciceSansCloture, periodeExercice } from "./cloture";
import { construireBalance, dateDouala, lireBalancePeriode, lireGrandLivre, lireJournaux, type LigneLivre } from "./livres";
import { csvBalance, csvGrandLivre, csvJournaux, type TableauCsv } from "./livres-export";
import { calculerTva, lireDeclarationTva } from "./tva";
import { lireEtatsFinanciers } from "./etats-donnees";
import { EtatsFinanciersPDF } from "@/lib/pdf/etats-financiers";

const csv = (t: TableauCsv) => ecrireCsv(t.entetes, t.lignes);
const n = String;
const MOIS = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];

/** Règle pure : compte de résultat d'un exercice à partir de ses écritures (sans l'écriture de clôture), jamais remis à zéro par elle. */
export function balanceDeGestion(lignes: LigneLivre[]): LigneBalance[] {
  const balance = construireBalance([], lignes);
  return balance.lignes
    .filter((l) => l.classe === 6 || l.classe === 7)
    .map((l) => ({ numero: l.numero, libelle: l.libelle, classe: l.classe, debit: l.mouvementDebit, credit: l.mouvementCredit, solde: l.mouvementDebit - l.mouvementCredit }));
}

/**
 * Dossier de l'expert-comptable pour un exercice : une archive ZIP de fichiers CSV (Excel français) — grand livre, balance, journaux,
 * plan comptable avec soldes, compte de résultat, bilan et TVA mois par mois — plus un LISEZMOI. Lecture seule, sous la protection
 * par entreprise ; l'appelant a déjà vérifié les droits.
 */
export async function construireDossierExpert(tx: TransactionDrizzle, entrepriseId: string, annee: number, maintenant: Date = new Date()): Promise<Buffer | null> {
  const periode = periodeExercice(annee);
  if (!periode) return null;
  const [maSociete] = await tx.select({ nom: entreprise.nom, niu: entreprise.niu }).from(entreprise).where(eq(entreprise.id, entrepriseId));

  const [grandLivre, balance, journaux, comptes, balanceFin, lignesGestion] = await Promise.all([
    lireGrandLivre(tx, entrepriseId, periode),
    lireBalancePeriode(tx, entrepriseId, periode),
    lireJournaux(tx, entrepriseId, periode),
    tx.select({ numero: compteComptable.numero, libelle: compteComptable.libelle, classe: compteComptable.classe }).from(compteComptable).orderBy(asc(compteComptable.numero)),
    calculerBalance(tx, entrepriseId, periode.au),
    lignesExerciceSansCloture(tx, entrepriseId, annee),
  ]);

  const soldes = new Map(balanceFin.map((l) => [l.numero, l.solde]));
  const planCsv: TableauCsv = {
    entetes: ["Compte", "Intitulé", "Classe", `Solde au 31/12/${annee} (débit +, crédit -)`],
    lignes: comptes.map((c) => [c.numero, c.libelle, n(c.classe), n(soldes.get(c.numero) ?? 0)]),
  };

  const resultat = calculerCompteDeResultat(balanceDeGestion(lignesGestion));
  const resultatCsv: TableauCsv = {
    entetes: ["Rubrique", "Compte", "Intitulé", "Montant"],
    lignes: [
      ...resultat.produits.map((l) => ["Produits", l.numero, l.libelle, n(-l.solde)]),
      ["Produits", "", "TOTAL DES PRODUITS", n(resultat.totalProduits)],
      ...resultat.charges.map((l) => ["Charges", l.numero, l.libelle, n(l.solde)]),
      ["Charges", "", "TOTAL DES CHARGES", n(resultat.totalCharges)],
      ["Résultat", "", resultat.resultatNet >= 0 ? "RÉSULTAT NET (bénéfice)" : "RÉSULTAT NET (perte)", n(resultat.resultatNet)],
    ],
  };

  const bilan = calculerBilan(balanceFin);
  const bilanCsv: TableauCsv = {
    entetes: ["Côté", "Compte", "Intitulé", "Montant"],
    lignes: [
      ...bilan.actif.map((l) => ["Actif", l.numero, l.libelle, n(l.solde)]),
      ["Actif", "", "TOTAL ACTIF", n(bilan.totalActif)],
      ...bilan.passif.map((l) => ["Passif", l.numero, l.libelle, n(-l.solde)]),
      ["Passif", "", "TOTAL PASSIF (résultat de l'exercice inclus)", n(bilan.totalPassif)],
    ],
  };

  const lignesTva: string[][] = [];
  for (let mois = 1; mois <= 12; mois++) {
    const du = dateDouala(`${annee}-${String(mois).padStart(2, "0")}-01`, false)!;
    const dernier = new Date(Date.UTC(annee, mois, 0)).getUTCDate();
    const au = dateDouala(`${annee}-${String(mois).padStart(2, "0")}-${String(dernier).padStart(2, "0")}`, true)!;
    const d = await lireDeclarationTva(tx, entrepriseId, { du, au });
    const r = calculerTva(d.tvaCollectee, d.tvaDeductible);
    lignesTva.push([MOIS[mois - 1], n(d.caHT), n(d.tvaCollectee), n(d.tvaDeductible), n(r.aPayer), n(r.creditAReporter)]);
  }
  const tvaCsv: TableauCsv = { entetes: ["Mois", "Chiffre d'affaires hors taxe", "TVA collectée", "TVA déductible", "TVA à payer", "Crédit de TVA"], lignes: lignesTva };

  const lisezmoi = [
    `Dossier de l'expert-comptable — exercice ${annee}`,
    `Entreprise : ${maSociete?.nom ?? ""}${maSociete?.niu ? ` (NIU ${maSociete.niu})` : ""}`,
    `Période : du 01/01/${annee} au 31/12/${annee}. Généré le ${new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeZone: "Africa/Douala" }).format(maintenant)} par Vertex One.`,
    "",
    "Contenu (fichiers CSV, séparateur « ; », lisibles dans Excel) :",
    "- grand-livre.csv : chaque compte, écriture par écriture, avec le solde reporté et le solde cumulé.",
    "- balance.csv : tous les comptes (ouverture, mouvements, clôture).",
    "- journaux.csv : les écritures classées par journal (ventes, achats, trésorerie, opérations diverses).",
    "- plan-comptable.csv : le plan comptable (SYSCOHADA et comptes personnalisés) avec le solde de chaque compte à la fin de l'exercice.",
    "- compte-de-resultat.csv : produits, charges et résultat de l'exercice (hors écriture de clôture).",
    "- bilan.csv : actif et passif à la fin de l'exercice.",
    "- etats-financiers.pdf : le bilan (actif en brut / amortissements / net, passif) et le compte de résultat avec ses soldes intermédiaires, présentés par rubriques SYSCOHADA.",
    "- tva.csv : chiffre d'affaires, TVA collectée, TVA déductible et TVA à payer mois par mois.",
    "",
    "Ces états sont générés automatiquement à partir des écritures de l'entreprise : ils sont à faire valider par votre comptable avant tout dépôt officiel auprès de la DGI.",
    "Les montants sont en FCFA. Pour les soldes : débit positif, crédit négatif.",
    "",
  ].join("\r\n");

  const fichiers: FichierZip[] = [
    { nom: "LISEZMOI.txt", contenu: lisezmoi },
    { nom: "grand-livre.csv", contenu: csv(csvGrandLivre(grandLivre)) },
    { nom: "balance.csv", contenu: csv(csvBalance(balance)) },
    { nom: "journaux.csv", contenu: csv(csvJournaux(journaux)) },
    { nom: "plan-comptable.csv", contenu: csv(planCsv) },
    { nom: "compte-de-resultat.csv", contenu: csv(resultatCsv) },
    { nom: "bilan.csv", contenu: csv(bilanCsv) },
    { nom: "tva.csv", contenu: csv(tvaCsv) },
  ];
  const etats = await lireEtatsFinanciers(tx, entrepriseId, annee);
  if (etats) fichiers.push({ nom: "etats-financiers.pdf", contenu: await renderToBuffer(createElement(EtatsFinanciersPDF, { etats, genereLe: maintenant }) as Parameters<typeof renderToBuffer>[0]) });
  return creerZip(fichiers, maintenant);
}
