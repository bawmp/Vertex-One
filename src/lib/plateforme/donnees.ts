import "server-only";
import { desc, eq, ne, and, sql } from "drizzle-orm";
import { dbPlateforme } from "@/db/plateforme";
import { entreprise, tentativePaiementAbonnement, journalActionPlateforme, groupe } from "@/db/schema";
import { calculerEtatAbonnement, type EvenementAbonnement } from "@/lib/abonnement/etat";

const PRIX_ABONNEMENT_MENSUEL = 50_000;

// Depuis l'abonnement plat (2026-09-14), tous les modules sont inclus : aucun n'est « activé » ni vendu séparément
// (disponibleAddon() renvoie toujours true, la table addonActif reste vide). L'usage réel — au moins une ligne créée
// dans la table cœur du module — est donc le seul signal fiable pour le staff (échange du 2026-09-17), et il vaut pour
// TOUS les modules, pas seulement les modules à la carte d'origine.
//
// Les noms de table sont des constantes ci-dessous (jamais une valeur venue d'une requête) : l'identifiant SQL est donc
// inséré tel quel sans risque d'injection. Le rôle plateforme_lecture voit toutes les entreprises (BYPASSRLS, SELECT
// seul) et reçoit automatiquement le droit de lecture sur les nouvelles tables (ACL par défaut, voir la checklist).
export const MODULES_SUIVIS = [
  { cle: "CRM", libelle: "One CRM", tables: ["contact"] },
  // One Books regroupe facturation, achats et comptabilité : une seule ligne, « utilisé » dès qu'une des trois parties l'est.
  { cle: "BOOKS", libelle: "One Books (facturation, achats, comptabilité)", tables: ["facture", "facture_fournisseur", "ecriture_comptable"] },
  { cle: "PROJETS", libelle: "One Projects", tables: ["projet"] },
  { cle: "DOCUMENTS", libelle: "One Docs", tables: ["document"] },
  { cle: "SIGNATURE", libelle: "One Sign (signature en ligne)", tables: ["demande_signature"] },
  { cle: "LIENS_CLIENTS", libelle: "Devis et factures en ligne (lien client)", tables: ["lien_client_document"] },
  { cle: "RH", libelle: "One People", tables: ["dossier_rh"] },
  { cle: "RECRUTEMENT", libelle: "One Recruit", tables: ["poste_ouvert"] },
  { cle: "MARKETING", libelle: "One Marketing", tables: ["campagne"] },
  { cle: "RESERVATIONS", libelle: "One Bookings", tables: ["service_reservable"] },
  { cle: "SUPPORT", libelle: "One Desk", tables: ["ticket_support"] },
  { cle: "ONE_FORM", libelle: "One Form", tables: ["formulaire"] },
  { cle: "ONE_VAULT", libelle: "One Vault", tables: ["secret_vault"] },
  { cle: "ONE_CHAT", libelle: "One Chat", tables: ["message_canal"] },
  { cle: "ANNONCES", libelle: "One Announcements", tables: ["annonce"] },
] as const;

export type CleModuleSuivi = (typeof MODULES_SUIVIS)[number]["cle"];

const identifiant = (table: string) => sql.raw(`"${table}"`);

/** Ensemble des entreprises présentes dans au moins une des tables d'un module (une seule table pour la plupart). */
const entreprisesDuModule = (tables: readonly string[]) => sql.raw(tables.map((t) => `select entreprise_id from "${t}"`).join(" union "));

/**
 * Un module dont la lecture échoue (table pas encore migrée, droit manquant) compte comme « non utilisé » et l'erreur est
 * journalisée : une seule table indisponible ne doit jamais faire tomber toute la page de la console.
 */
async function utilise(entrepriseId: string, tables: readonly string[]): Promise<boolean> {
  for (const table of tables) {
    try {
      const resultat = await dbPlateforme.execute(sql`select 1 as present from ${identifiant(table)} where entreprise_id = ${entrepriseId} limit 1`);
      if (resultat.rows.length > 0) return true;
    } catch (erreur) {
      console.error(`[plateforme] lecture d'usage impossible pour ${table} :`, erreur instanceof Error ? erreur.message : erreur);
    }
  }
  return false;
}

export async function recupererModulesUtilises(entrepriseId: string): Promise<CleModuleSuivi[]> {
  const resultats = await Promise.all(MODULES_SUIVIS.map(async (m) => ((await utilise(entrepriseId, m.tables)) ? m.cle : null)));
  return resultats.filter((cle): cle is CleModuleSuivi => cle !== null);
}

export type AdoptionModule = { cle: CleModuleSuivi; libelle: string; entreprises: number };

/** Nombre d'entreprises qui utilisent réellement chaque module (au moins une ligne créée), du plus au moins adopté. */
export async function recupererAdoptionModules(): Promise<AdoptionModule[]> {
  const lignes = await Promise.all(
    MODULES_SUIVIS.map(async (m) => {
      try {
        const resultat = await dbPlateforme.execute(sql`select count(*)::int as total from (${entreprisesDuModule(m.tables)}) as usage_module`);
        return { cle: m.cle, libelle: m.libelle, entreprises: Number((resultat.rows[0] as { total: number } | undefined)?.total ?? 0) };
      } catch (erreur) {
        console.error(`[plateforme] adoption impossible pour ${m.tables.join(", ")} :`, erreur instanceof Error ? erreur.message : erreur);
        return { cle: m.cle, libelle: m.libelle, entreprises: 0 };
      }
    })
  );
  return lignes.sort((a, b) => b.entreprises - a.entreprises || a.libelle.localeCompare(b.libelle, "fr"));
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
