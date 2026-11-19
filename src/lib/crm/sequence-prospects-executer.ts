import { and, eq, gte, isNotNull, isNull, sql } from "drizzle-orm";
import { avecEntreprise, type TransactionDrizzle } from "@/db/client";
import { entreprise, lead, relanceProspect, utilisateur } from "@/db/schema";
import { traducteur } from "@/lib/i18n/catalogue";
import { MODELES_RELANCE } from "@/lib/crm/prospects";
import { envoyerEmailAuProspect } from "@/lib/crm/relance-email";
import { DELAIS_PAR_DEFAUT, PIED_EMAIL_AUTOMATIQUE, PLAFOND_PAR_DEFAUT, decider, jourPrevuEtape, lireDelais, type DecisionSequence } from "@/lib/crm/sequence-prospects";
import { aujourdhuiDouala } from "@/lib/facturation/promesse-regles";
import type { Langue } from "@/lib/session";

export type CandidatSequence = {
  id: string;
  nom: string;
  email: string;
  rappelLe: string | null;
  qualifieLe: Date | null;
  creeLe: Date;
  statut: string;
  convertiLe: Date | null;
  sequenceEtape: number;
  sequenceDerniereLe: Date | null;
  sequenceArreteeLe: Date | null;
  derniereRelanceLe: Date | null;
  assigneEmail: string | null;
  assigneLangue: string | null;
};

type Configuration = { active: boolean; delais: number[]; plafond: number; nomEntreprise: string };

export async function lireConfiguration(tx: TransactionDrizzle, entrepriseId: string): Promise<Configuration | null> {
  const [e] = await tx
    .select({ nom: entreprise.nom, active: entreprise.sequenceProspectsActive, delais: entreprise.sequenceProspectsDelais, plafond: entreprise.sequenceProspectsPlafond })
    .from(entreprise)
    .where(eq(entreprise.id, entrepriseId));
  if (!e) return null;
  return { active: e.active, delais: lireDelais(e.delais) ?? DELAIS_PAR_DEFAUT, plafond: e.plafond > 0 ? e.plafond : PLAFOND_PAR_DEFAUT, nomEntreprise: e.nom };
}

/** Prospects dont la séquence est en cours (qualifiés, pas clients, pas arrêtés, avec adresse, étapes restantes), avec leur dernière relance toutes catégories. */
export async function candidatsSequence(tx: TransactionDrizzle, nbEtapes: number): Promise<CandidatSequence[]> {
  const lignes = await tx
    .select({
      id: lead.id,
      nom: lead.nom,
      email: lead.email,
      rappelLe: lead.rappelLe,
      qualifieLe: lead.qualifieLe,
      creeLe: lead.creeLe,
      statut: lead.statut,
      convertiLe: lead.convertiLe,
      sequenceEtape: lead.sequenceEtape,
      sequenceDerniereLe: lead.sequenceDerniereLe,
      sequenceArreteeLe: lead.sequenceArreteeLe,
      derniereRelanceLe: sql<Date | null>`(select max(${relanceProspect.creeLe}) from ${relanceProspect} where ${relanceProspect.leadId} = ${lead.id} and ${relanceProspect.canal} <> 'note')`,
      assigneEmail: utilisateur.email,
      assigneLangue: utilisateur.langue,
    })
    .from(lead)
    .leftJoin(utilisateur, and(eq(utilisateur.id, lead.assigneAId), eq(utilisateur.entrepriseId, lead.entrepriseId)))
    .where(and(eq(lead.statut, "QUALIFIE"), isNull(lead.convertiLe), isNull(lead.sequenceArreteeLe), isNotNull(lead.email), sql`${lead.sequenceEtape} < ${nbEtapes}`));
  return lignes.map((l) => ({
    ...l,
    email: l.email as string,
    derniereRelanceLe: l.derniereRelanceLe ? new Date(l.derniereRelanceLe as unknown as string) : null,
  }));
}

export type LigneApercu = { id: string; nom: string; etape: number; jour: string };

/**
 * Qui recevrait un e-mail automatique à ce passage ? (aperçu des réglages, sans rien envoyer) — même décision que l'exécution réelle, jamais une estimation à part.
 * `dus` : les envois dus maintenant ; `aVenir` : le nombre de prospects dont un envoi est prévu plus tard.
 */
export async function apercuSequence(tx: TransactionDrizzle, entrepriseId: string, maintenant: Date = new Date()): Promise<{ dus: LigneApercu[]; aVenir: number } | null> {
  const config = await lireConfiguration(tx, entrepriseId);
  if (!config) return null;
  const candidats = await candidatsSequence(tx, config.delais.length);
  const dus: LigneApercu[] = [];
  let aVenir = 0;
  for (const c of candidats) {
    const d: DecisionSequence = decider(c, config.delais, maintenant);
    if (d.action === "ENVOYER") dus.push({ id: c.id, nom: c.nom, etape: d.etape + 1, jour: jourPrevuEtape(c, d.etape, config.delais) });
    else if (d.action === "ATTENDRE") aVenir += 1;
  }
  dus.sort((a, b) => a.jour.localeCompare(b.jour));
  return { dus, aVenir };
}

export type ResultatSequence = { active: boolean; envoyes: number; echecs: number; reportes: number };

/**
 * Passage quotidien de la relance automatique pour UNE entreprise (appelé par la tâche planifiée, jamais depuis un écran).
 * Garde-fous : rien si le réglage est désactivé ; au plus `plafond` e-mails par jour (les plus en retard d'abord, le reste attend demain) ; chaque
 * prospect est RÉSERVÉ avant l'envoi (l'étape avance d'abord, avec un test de concurrence) pour qu'un double passage n'envoie jamais deux fois ; l'envoi se
 * fait hors de toute transaction ; s'il échoue, la réservation est annulée (le prochain passage réessaie) et rien n'est noté dans l'historique.
 */
export async function executerSequenceEntreprise(entrepriseId: string, maintenant: Date = new Date()): Promise<ResultatSequence> {
  const aujourdhui = aujourdhuiDouala(maintenant);

  const preparation = await avecEntreprise(entrepriseId, async (tx) => {
    const config = await lireConfiguration(tx, entrepriseId);
    if (!config || !config.active) return null;
    // Combien d'e-mails automatiques sont déjà partis AUJOURD'HUI (à l'heure de Douala) : le plafond est quotidien.
    const recents = await tx
      .select({ creeLe: relanceProspect.creeLe })
      .from(relanceProspect)
      .where(and(eq(relanceProspect.automatique, true), gte(relanceProspect.creeLe, new Date(maintenant.getTime() - 36 * 3600 * 1000))));
    const dejaAujourdhui = recents.filter((r) => aujourdhuiDouala(r.creeLe) === aujourdhui).length;

    const candidats = await candidatsSequence(tx, config.delais.length);
    const dus: { c: CandidatSequence; etape: number; modele: string; jour: string }[] = [];
    for (const c of candidats) {
      const d = decider(c, config.delais, maintenant);
      if (d.action === "ENVOYER") dus.push({ c, etape: d.etape, modele: d.modele, jour: jourPrevuEtape(c, d.etape, config.delais) });
    }
    dus.sort((a, b) => a.jour.localeCompare(b.jour));
    return { config, dus, places: Math.max(0, config.plafond - dejaAujourdhui) };
  });
  if (!preparation) return { active: false, envoyes: 0, echecs: 0, reportes: 0 };

  const { config, dus, places } = preparation;
  let envoyes = 0;
  let echecs = 0;
  for (const { c, etape, modele } of dus.slice(0, places)) {
    // 1. Réserver : l'étape avance seulement si le prospect est toujours dans l'état lu (un autre passage ou une action de l'équipe l'a peut-être changé).
    const reserve = await avecEntreprise(entrepriseId, async (tx) => {
      const lignes = await tx
        .update(lead)
        .set({ sequenceEtape: etape + 1, sequenceDerniereLe: maintenant })
        .where(and(eq(lead.id, c.id), eq(lead.sequenceEtape, etape), isNull(lead.sequenceArreteeLe), eq(lead.statut, "QUALIFIE"), isNull(lead.convertiLe)))
        .returning({ id: lead.id });
      return lignes.length === 1;
    });
    if (!reserve) continue;

    // 2. Écrire dans la langue de la personne qui suit ce prospect, avec le nom du prospect et de l'entreprise ; la réponse arrive à cette personne.
    const t = traducteur((c.assigneLangue as Langue | null) ?? undefined);
    const mo = MODELES_RELANCE.find((x) => x.cle === modele) ?? MODELES_RELANCE[0];
    const valeurs = { nom: c.nom, entreprise: config.nomEntreprise };
    const resultat = await envoyerEmailAuProspect({
      entrepriseId,
      leadId: c.id,
      rappelLe: c.rappelLe,
      destinataire: c.email,
      objet: t(mo.objet, valeurs),
      message: t(mo.message, valeurs),
      auteurId: null,
      automatique: true,
      expediteur: { nomExpediteur: config.nomEntreprise, ...(c.assigneEmail ? { replyTo: c.assigneEmail } : {}) },
      pied: t(PIED_EMAIL_AUTOMATIQUE),
    }).catch((erreur: unknown) => ({ envoye: false, erreur: erreur instanceof Error ? erreur.message : "erreur inconnue" }));

    if (resultat.envoye) {
      envoyes += 1;
    } else {
      echecs += 1;
      // 3. Échec : on annule la réservation (le prochain passage réessaiera), sans rien noter dans l'historique.
      await avecEntreprise(entrepriseId, (tx) =>
        tx.update(lead).set({ sequenceEtape: etape, sequenceDerniereLe: c.sequenceDerniereLe }).where(and(eq(lead.id, c.id), eq(lead.sequenceEtape, etape + 1)))
      );
    }
  }
  return { active: true, envoyes, echecs, reportes: Math.max(0, dus.length - places) };
}
