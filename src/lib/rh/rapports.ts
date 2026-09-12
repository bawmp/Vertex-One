import { eq, and, inArray, gte } from "drizzle-orm";
import type { TransactionDrizzle } from "@/db/client";
import { dossierRH, utilisateur, demandeConge, regularisationPointage, pointage, ticketRH, sondage, sondageQuestion, sondageReponse, sondageParticipation } from "@/db/schema";
import { debutJournee } from "@/lib/rh/pointage";
import { calculerResultatsQuestion } from "@/lib/rh/sondage";

/**
 * Rapports RH consolidés (échange du 2026-09-12, comparaison avec Zoho
 * People — "Reports", modèle Mes données/Équipe/Entreprise). Agrège des
 * lignes déjà lues plutôt que des agrégats SQL — même style que
 * tableauEquipe()/calculerResultatsQuestion() dans ce module, volumes de
 * données toujours modestes à l'échelle d'une TPE.
 */

export type RapportPersonnel = {
  soldeConges: number;
  congesPrisAnnee: number;
  regularisationsEnAttente: number;
  ticketsOuverts: number;
};

export async function rapportPersonnel(tx: TransactionDrizzle, dossierRHId: string): Promise<RapportPersonnel> {
  const [dossier] = await tx.select({ soldeConges: dossierRH.soldeConges, utilisateurId: dossierRH.utilisateurId }).from(dossierRH).where(eq(dossierRH.id, dossierRHId));

  const debutAnnee = new Date(new Date().getFullYear(), 0, 1);
  const demandes = await tx
    .select({ nombreJours: demandeConge.nombreJours })
    .from(demandeConge)
    .where(and(eq(demandeConge.dossierRHId, dossierRHId), eq(demandeConge.type, "CONGE_PAYE"), eq(demandeConge.statut, "APPROUVEE"), gte(demandeConge.dateDebut, debutAnnee)));
  const congesPrisAnnee = demandes.reduce((total, d) => total + d.nombreJours, 0);

  const regularisations = await tx
    .select({ id: regularisationPointage.id })
    .from(regularisationPointage)
    .where(and(eq(regularisationPointage.dossierRHId, dossierRHId), eq(regularisationPointage.statut, "EN_ATTENTE")));

  const tickets = dossier
    ? await tx.select({ id: ticketRH.id }).from(ticketRH).where(and(eq(ticketRH.demandeurId, dossier.utilisateurId), inArray(ticketRH.statut, ["OUVERT", "EN_COURS"])))
    : [];

  return {
    soldeConges: dossier?.soldeConges ?? 0,
    congesPrisAnnee,
    regularisationsEnAttente: regularisations.length,
    ticketsOuverts: tickets.length,
  };
}

export type LigneRapportEquipe = {
  dossierRHId: string;
  nomComplet: string;
  soldeConges: number;
  demandesCongeEnAttente: number;
  presentAujourdhui: boolean;
};

export async function rapportEquipe(tx: TransactionDrizzle, idsDossiersRH: string[]): Promise<LigneRapportEquipe[]> {
  if (idsDossiersRH.length === 0) return [];

  const dossiers = await tx
    .select({ id: dossierRH.id, soldeConges: dossierRH.soldeConges, nomComplet: utilisateur.nomComplet })
    .from(dossierRH)
    .innerJoin(utilisateur, eq(dossierRH.utilisateurId, utilisateur.id))
    .where(inArray(dossierRH.id, idsDossiersRH));

  const demandesEnAttente = await tx.select({ dossierRHId: demandeConge.dossierRHId }).from(demandeConge).where(and(inArray(demandeConge.dossierRHId, idsDossiersRH), eq(demandeConge.statut, "EN_ATTENTE")));

  const aujourdHui = debutJournee(new Date());
  const pointagesDuJour = await tx.select({ dossierRHId: pointage.dossierRHId }).from(pointage).where(and(inArray(pointage.dossierRHId, idsDossiersRH), eq(pointage.date, aujourdHui)));
  const idsPresents = new Set(pointagesDuJour.map((p) => p.dossierRHId));

  return dossiers.map((d) => ({
    dossierRHId: d.id,
    nomComplet: d.nomComplet,
    soldeConges: d.soldeConges,
    demandesCongeEnAttente: demandesEnAttente.filter((e) => e.dossierRHId === d.id).length,
    presentAujourdhui: idsPresents.has(d.id),
  }));
}

export type RapportEntreprise = {
  repartitionContrats: Record<string, number>;
  dossiersActifs: number;
  dossiersPartis: number;
  ticketsParStatut: Record<string, number>;
  masseSalariale: number;
  dernierSondage: { titre: string; resultats: ReturnType<typeof calculerResultatsQuestion>[]; tauxParticipation: number } | null;
};

export async function rapportEntreprise(tx: TransactionDrizzle, entrepriseId: string): Promise<RapportEntreprise> {
  const dossiers = await tx.select({ typeContrat: dossierRH.typeContrat, dateDepart: dossierRH.dateDepart, salaireBase: dossierRH.salaireBase }).from(dossierRH).where(eq(dossierRH.entrepriseId, entrepriseId));

  const repartitionContrats: Record<string, number> = {};
  let dossiersActifs = 0;
  let dossiersPartis = 0;
  let masseSalariale = 0;
  for (const d of dossiers) {
    if (d.dateDepart) {
      dossiersPartis += 1;
      continue;
    }
    dossiersActifs += 1;
    repartitionContrats[d.typeContrat] = (repartitionContrats[d.typeContrat] ?? 0) + 1;
    masseSalariale += d.salaireBase ?? 0;
  }

  const tickets = await tx.select({ statut: ticketRH.statut }).from(ticketRH).where(eq(ticketRH.entrepriseId, entrepriseId));
  const ticketsParStatut: Record<string, number> = {};
  for (const t of tickets) ticketsParStatut[t.statut] = (ticketsParStatut[t.statut] ?? 0) + 1;

  const [dernierSondageFerme] = await tx
    .select({ id: sondage.id, titre: sondage.titre })
    .from(sondage)
    .where(and(eq(sondage.entrepriseId, entrepriseId), eq(sondage.statut, "FERME")))
    .orderBy(sondage.creeLe);

  let dernierSondage: RapportEntreprise["dernierSondage"] = null;
  if (dernierSondageFerme) {
    const questions = await tx.select().from(sondageQuestion).where(eq(sondageQuestion.sondageId, dernierSondageFerme.id));
    const reponses = await tx.select().from(sondageReponse).where(eq(sondageReponse.sondageId, dernierSondageFerme.id));
    const resultats = questions.map((q) => calculerResultatsQuestion(q.type, reponses.filter((r) => r.questionId === q.id).map((r) => r.valeur)));
    const participations = await tx.select({ id: sondageParticipation.id }).from(sondageParticipation).where(eq(sondageParticipation.sondageId, dernierSondageFerme.id));
    // Sur l'effectif actif au moment du rapport, pas au moment du sondage
    // (aucun historique d'effectif conservé) — une approximation raisonnable,
    // jamais présentée comme une mesure exacte a posteriori.
    const tauxParticipation = dossiersActifs > 0 ? Math.round((participations.length / dossiersActifs) * 100) : 0;
    dernierSondage = { titre: dernierSondageFerme.titre, resultats, tauxParticipation };
  }

  return { repartitionContrats, dossiersActifs, dossiersPartis, ticketsParStatut, masseSalariale, dernierSondage };
}
