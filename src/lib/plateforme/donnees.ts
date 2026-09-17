import "server-only";
import { desc, eq, ne, and } from "drizzle-orm";
import { dbPlateforme } from "@/db/plateforme";
import { entreprise, tentativePaiementAbonnement, journalActionPlateforme, groupe, campagne, serviceReservable, posteOuvert, ticketSupport, formulaire } from "@/db/schema";
import { calculerEtatAbonnement, type EvenementAbonnement } from "@/lib/abonnement/etat";
import type { Addon } from "@/lib/plans";

const PRIX_ABONNEMENT_MENSUEL = 50_000;

// disponibleAddon() (src/lib/plans.ts) renvoie toujours true depuis
// l'abonnement plat (2026-09-14) — le bouton "Activer" de chaque module ne
// s'affiche donc plus jamais, et la table addonActif reste vide en pratique
// pour tous les vrais clients. L'usage réel (au moins une ligne créée dans
// la table cœur du module) est le seul signal fiable pour le staff — voir
// échange du 2026-09-17.
async function utilise(entrepriseId: string, table: typeof campagne | typeof serviceReservable | typeof posteOuvert | typeof ticketSupport | typeof formulaire): Promise<boolean> {
  const [ligne] = await dbPlateforme.select({ id: table.id }).from(table).where(eq(table.entrepriseId, entrepriseId)).limit(1);
  return !!ligne;
}

export async function recupererModulesUtilises(entrepriseId: string): Promise<Addon[]> {
  const paires: [Addon, typeof campagne | typeof serviceReservable | typeof posteOuvert | typeof ticketSupport | typeof formulaire][] = [
    ["MARKETING", campagne],
    ["RESERVATIONS", serviceReservable],
    ["RECRUTEMENT", posteOuvert],
    ["SUPPORT", ticketSupport],
    ["ONE_FORM", formulaire],
  ];
  const resultats = await Promise.all(paires.map(async ([addon, table]) => ((await utilise(entrepriseId, table)) ? addon : null)));
  return resultats.filter((a): a is Addon => a !== null);
}

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

  const [paiements, journal, modulesUtilises] = await Promise.all([
    dbPlateforme.select().from(tentativePaiementAbonnement).where(eq(tentativePaiementAbonnement.entrepriseId, entrepriseId)).orderBy(desc(tentativePaiementAbonnement.creeLe)),
    dbPlateforme.select().from(journalActionPlateforme).where(eq(journalActionPlateforme.entrepriseId, entrepriseId)).orderBy(desc(journalActionPlateforme.creeLe)),
    recupererModulesUtilises(entrepriseId),
  ]);

  // Groupe (2026-09-15) — visible côté staff comme côté client (Paramètres
  // → Entreprise), toujours en lecture seule ici (dbPlateforme).
  let nomGroupe: string | null = null;
  let filiales: { id: string; nom: string; statutAbonnement: string }[] = [];
  if (monEntreprise.groupeId) {
    const [g] = await dbPlateforme.select({ nom: groupe.nom }).from(groupe).where(eq(groupe.id, monEntreprise.groupeId));
    nomGroupe = g?.nom ?? null;
    filiales = await dbPlateforme
      .select({ id: entreprise.id, nom: entreprise.nom, statutAbonnement: entreprise.statutAbonnement })
      .from(entreprise)
      .where(and(eq(entreprise.groupeId, monEntreprise.groupeId), ne(entreprise.id, entrepriseId)));
  }

  return { entreprise: monEntreprise, paiements, journal, nomGroupe, filiales, modulesUtilises };
}
