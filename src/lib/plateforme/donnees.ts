import "server-only";
import { desc, eq } from "drizzle-orm";
import { dbPlateforme } from "@/db/plateforme";
import { entreprise, tentativePaiementAbonnement, journalActionPlateforme } from "@/db/schema";
import { calculerEtatAbonnement, type EvenementAbonnement } from "@/lib/abonnement/etat";

const PRIX_ABONNEMENT_MENSUEL = 50_000;

export type EntrepriseAttention = { id: string; nom: string; evenement: EvenementAbonnement };

export async function recupererKpiPlateforme() {
  const lignes = await dbPlateforme
    .select({
      id: entreprise.id,
      nom: entreprise.nom,
      statutAbonnement: entreprise.statutAbonnement,
      essaiFinLe: entreprise.essaiFinLe,
      abonnementEcheanceLe: entreprise.abonnementEcheanceLe,
      creeLe: entreprise.creeLe,
    })
    .from(entreprise);

  const maintenant = new Date();
  const parStatut = { essai: 0, actif: 0, suspendu: 0 };
  const attention: EntrepriseAttention[] = [];

  for (const e of lignes) {
    if (e.statutAbonnement in parStatut) parStatut[e.statutAbonnement as keyof typeof parStatut]++;
    const { evenement } = calculerEtatAbonnement({ essaiFinLe: e.essaiFinLe, abonnementEcheanceLe: e.abonnementEcheanceLe }, maintenant);
    if (evenement) attention.push({ id: e.id, nom: e.nom, evenement });
  }

  const inscriptionsRecentes = [...lignes].sort((a, b) => b.creeLe.getTime() - a.creeLe.getTime()).slice(0, 5);

  return {
    total: lignes.length,
    parStatut,
    mrrEstime: parStatut.actif * PRIX_ABONNEMENT_MENSUEL,
    inscriptionsRecentes,
    attention,
  };
}

export async function recupererListeEntreprises() {
  return dbPlateforme
    .select({
      id: entreprise.id,
      nom: entreprise.nom,
      secteurProfil: entreprise.secteurProfil,
      statutAbonnement: entreprise.statutAbonnement,
      essaiFinLe: entreprise.essaiFinLe,
      abonnementEcheanceLe: entreprise.abonnementEcheanceLe,
      creeLe: entreprise.creeLe,
    })
    .from(entreprise)
    .orderBy(desc(entreprise.creeLe));
}

export async function recupererDetailEntreprise(entrepriseId: string) {
  const [monEntreprise] = await dbPlateforme.select().from(entreprise).where(eq(entreprise.id, entrepriseId));
  if (!monEntreprise) return null;

  const [paiements, journal] = await Promise.all([
    dbPlateforme.select().from(tentativePaiementAbonnement).where(eq(tentativePaiementAbonnement.entrepriseId, entrepriseId)).orderBy(desc(tentativePaiementAbonnement.creeLe)),
    dbPlateforme.select().from(journalActionPlateforme).where(eq(journalActionPlateforme.entrepriseId, entrepriseId)).orderBy(desc(journalActionPlateforme.creeLe)),
  ]);

  return { entreprise: monEntreprise, paiements, journal };
}
