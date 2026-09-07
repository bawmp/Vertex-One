import { eq, inArray, gte, ne, and } from "drizzle-orm";
import type { TransactionDrizzle } from "@/db/client";
import { entreprise, utilisateur, factureFournisseur, depense, compteComptable, projet } from "@/db/schema";
import { peut } from "@/lib/permissions";
import { disponible } from "@/lib/plans";
import { idsVisibles, projetsVisibles } from "@/lib/portee";
import { calculerBalance, calculerCompteDeResultat } from "@/lib/comptabilite/etats-financiers";
import type { UtilisateurConnecte } from "@/lib/session";

export type TableauDeBordFaco = {
  monNom: string;
  nomEntreprise: string;
  facturesFournisseur: { montantTTC: number; statut: string; dateEcheance: Date }[] | null;
  financier: {
    debutAnnee: Date;
    especesOuverture: number;
    entrant: number;
    sortant: number;
    especesCloture: number;
    totalProduits: number;
    totalCharges: number;
  } | null;
  depensesPrincipales: { libelle: string; total: number }[];
  projetsWatchlist: { id: string; titre: string; statut: string }[];
  peutVoirBanque: boolean;
};

/**
 * Tableau de bord FACO (échange du 2026-09-07, "l'accueil de FACO a un
 * tableau de bord") — mirroir simplifié de l'accueil Zoho Books : "Votre
 * logo"/"Démarrage"/"Mises à jour récentes" sont du chrome d'onboarding
 * Zoho, jamais construits ici (pas de donnée réelle derrière). Les
 * graphiques mensuels (Flux de trésorerie/Revenu et dépense) sont réduits à
 * des totaux sur l'exercice en cours plutôt qu'une visualisation mois par
 * mois : ce projet n'a aucune bibliothèque de graphiques (voir
 * docs/crm-roadmap-post-commercialisation.md, "Rapports avancés... hors
 * périmètre") — les chiffres restent réels, seule la visualisation est
 * différée. "Banque et cartes de crédit" renvoie vers le Rapprochement
 * bancaire déjà construit (import de relevé CSV), jamais une vraie
 * connexion bancaire (aucun agrégateur bancaire n'est configuré).
 *
 * Chaque section respecte sa propre permission/portée, indépendamment des
 * autres — un Employé sans accès Comptabilité ne voit jamais le Flux de
 * trésorerie ni le Revenu/Dépense (dérivés du grand livre, réservé à
 * l'Administrateur — voir CLAUDE.md), mais peut voir ses propres factures
 * fournisseurs impayées si son rôle a accès à Achats.
 */
export async function recupererTableauDeBordFaco(tx: TransactionDrizzle, utilisateurConnecte: UtilisateurConnecte): Promise<TableauDeBordFaco> {
  const [[monEntreprise], [monUtilisateur]] = await Promise.all([
    tx
      .select({ nom: entreprise.nom, planAbonnement: entreprise.planAbonnement, statutAbonnement: entreprise.statutAbonnement })
      .from(entreprise)
      .where(eq(entreprise.id, utilisateurConnecte.entrepriseId)),
    tx.select({ nomComplet: utilisateur.nomComplet }).from(utilisateur).where(eq(utilisateur.id, utilisateurConnecte.utilisateurId)),
  ]);

  const debutAnnee = new Date(new Date().getFullYear(), 0, 1);
  const peutVoirAchats = peut(utilisateurConnecte.role, "ACHATS", "VOIR");
  const peutVoirCompta = peut(utilisateurConnecte.role, "COMPTABILITE", "VOIR") && disponible(monEntreprise, "COMPTABILITE_COMPLETE");
  const peutVoirProjets = peut(utilisateurConnecte.role, "PROJETS", "VOIR") && disponible(monEntreprise, "PROJETS");

  type LigneFactureFournisseur = { montantTTC: number; statut: string; dateEcheance: Date; assigneAId: string };
  type LigneDepense = { compteComptableId: string; montantTTC: number; assigneAId: string };
  type LigneProjet = { id: string; titre: string; statut: string };
  type Financier = TableauDeBordFaco["financier"];

  const facturesFournisseurPromise: Promise<LigneFactureFournisseur[] | null> = peutVoirAchats
    ? (async () => {
        const visibles = await idsVisibles(tx, utilisateurConnecte, "ACHATS");
        const base = tx
          .select({ montantTTC: factureFournisseur.montantTTC, statut: factureFournisseur.statut, dateEcheance: factureFournisseur.dateEcheance, assigneAId: factureFournisseur.assigneAId })
          .from(factureFournisseur);
        return visibles === "TOUT" ? await base : await base.where(inArray(factureFournisseur.assigneAId, visibles));
      })()
    : Promise.resolve(null);

  const depensesPromise: Promise<LigneDepense[]> = peutVoirAchats
    ? (async () => {
        const visibles = await idsVisibles(tx, utilisateurConnecte, "ACHATS");
        const condition = visibles === "TOUT" ? gte(depense.datePaiement, debutAnnee) : and(gte(depense.datePaiement, debutAnnee), inArray(depense.assigneAId, visibles));
        return tx.select({ compteComptableId: depense.compteComptableId, montantTTC: depense.montantTTC, assigneAId: depense.assigneAId }).from(depense).where(condition);
      })()
    : Promise.resolve([]);

  const financierPromise: Promise<Financier> = peutVoirCompta
    ? (async () => {
        const maintenant = new Date();
        const veilleDebutAnnee = new Date(debutAnnee.getTime() - 1);
        const [balanceOuverture, balanceAnnee] = await Promise.all([
          calculerBalance(tx, utilisateurConnecte.entrepriseId, veilleDebutAnnee),
          calculerBalance(tx, utilisateurConnecte.entrepriseId, maintenant, debutAnnee),
        ]);
        const especesOuverture = balanceOuverture.filter((l) => l.classe === 5).reduce((s, l) => s + l.solde, 0);
        const mouvementsTresorerie = balanceAnnee.filter((l) => l.classe === 5);
        const entrant = mouvementsTresorerie.reduce((s, l) => s + l.debit, 0);
        const sortant = mouvementsTresorerie.reduce((s, l) => s + l.credit, 0);
        const { totalProduits, totalCharges } = calculerCompteDeResultat(balanceAnnee);
        return { debutAnnee, especesOuverture, entrant, sortant, especesCloture: especesOuverture + entrant - sortant, totalProduits, totalCharges };
      })()
    : Promise.resolve(null);

  const projetsPromise: Promise<LigneProjet[]> = peutVoirProjets
    ? (async () => {
        const visibles = await projetsVisibles(tx, utilisateurConnecte);
        if (visibles !== "TOUT" && visibles.length === 0) return [];
        const condition = visibles === "TOUT" ? ne(projet.statut, "TERMINE") : and(ne(projet.statut, "TERMINE"), inArray(projet.id, visibles));
        const lignes = await tx.select({ id: projet.id, titre: projet.titre, statut: projet.statut }).from(projet).where(condition);
        return lignes.slice(0, 5);
      })()
    : Promise.resolve([]);

  const [facturesFournisseur, depensesBrutes, financier, projetsBrutes] = await Promise.all([facturesFournisseurPromise, depensesPromise, financierPromise, projetsPromise]);

  let depensesPrincipales: { libelle: string; total: number }[] = [];
  if (depensesBrutes.length > 0) {
    const idsComptes = [...new Set(depensesBrutes.map((d) => d.compteComptableId))];
    const comptes = await tx.select({ id: compteComptable.id, libelle: compteComptable.libelle }).from(compteComptable).where(inArray(compteComptable.id, idsComptes));
    const libelleParCompte = new Map(comptes.map((c) => [c.id, c.libelle]));
    const totauxParCompte = new Map<string, number>();
    for (const d of depensesBrutes) {
      totauxParCompte.set(d.compteComptableId, (totauxParCompte.get(d.compteComptableId) ?? 0) + d.montantTTC);
    }
    depensesPrincipales = [...totauxParCompte.entries()]
      .map(([compteId, total]) => ({ libelle: libelleParCompte.get(compteId) ?? "Autre", total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
  }

  return {
    monNom: monUtilisateur?.nomComplet ?? "",
    nomEntreprise: monEntreprise?.nom ?? "",
    facturesFournisseur,
    financier,
    depensesPrincipales,
    projetsWatchlist: projetsBrutes,
    peutVoirBanque: peutVoirCompta,
  };
}
