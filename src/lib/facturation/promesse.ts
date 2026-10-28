import { and, asc, desc, eq, gte, inArray } from "drizzle-orm";
import type { TransactionDrizzle } from "@/db/client";
import { contact, facture, interaction, paiement, promessePaiement } from "@/db/schema";
import { formaterFCFA } from "@/lib/facturation/calcul";
import { lireSolde } from "@/lib/facturation/solde";
import { adressesAAlerter, alerterParEmail, echapper } from "@/lib/notifications/equipe";
import { m } from "@/lib/i18n/catalogue";
import { aujourdhuiDouala, determinerMontantPromesse, promesseEchue, promesseTenue, type CanalPromesse } from "./promesse-regles";

export type PromesseLigne = typeof promessePaiement.$inferSelect;

/** Tolérance entre l'horloge de la base (création de la promesse) et celle de l'application (date d'un règlement). */
const TOLERANCE_HORLOGE_MS = 5 * 60 * 1000;

const dateFr = (jour: string) => new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${jour}T00:00:00Z`));

/** La promesse en cours d'une facture, s'il y en a une (il n'y en a jamais plus d'une : index unique partiel). */
export async function promesseEnCours(tx: TransactionDrizzle, factureId: string): Promise<PromesseLigne | null> {
  const [p] = await tx.select().from(promessePaiement).where(and(eq(promessePaiement.factureId, factureId), eq(promessePaiement.statut, "EN_COURS")));
  return p ?? null;
}

/** Historique d'une facture : la plus récente d'abord. */
export async function historiquePromesses(tx: TransactionDrizzle, factureId: string): Promise<PromesseLigne[]> {
  return tx.select().from(promessePaiement).where(eq(promessePaiement.factureId, factureId)).orderBy(desc(promessePaiement.creeLe));
}

/** Ligne de l'historique du contact (page du contact) : la promesse y reste lisible à côté des appels et des emails. */
async function journaliser(tx: TransactionDrizzle, p: { entrepriseId: string; contactId: string | null; type: string; contenu: string; auteurId: string | null }) {
  if (!p.contactId) return;
  await tx.insert(interaction).values({ entrepriseId: p.entrepriseId, contactId: p.contactId, type: p.type, contenu: p.contenu, auteurId: p.auteurId });
}

export type ParametresPromesse = {
  entrepriseId: string;
  factureId: string;
  datePromise: string;
  /** Absent = tout le solde. */
  montant?: unknown;
  canal: CanalPromesse | "client";
  source: "EQUIPE" | "CLIENT";
  note: string | null;
  creeParId: string | null;
  clientIp: string | null;
};

export type ResultatPromesse =
  | { erreur: string }
  | { promesse: PromesseLigne; numeroFacture: string; assigneAId: string; contactId: string | null; nomClient: string | null };

/**
 * Enregistre une promesse de paiement pour une facture de l'entreprise : la facture doit exister (dans CETTE entreprise), ne pas
 * être réglée ni annulée, et le montant promis ne peut pas dépasser le solde. Une promesse déjà en cours est REMPLACÉE (annulée,
 * gardée dans l'historique) : il n'y en a jamais deux à la fois. La date doit avoir été vérifiée par l'appelant
 * (verifierDatePromesse). La ligne apparaît aussi dans l'historique du contact.
 */
export async function enregistrerPromesse(tx: TransactionDrizzle, p: ParametresPromesse): Promise<ResultatPromesse> {
  const [laFacture] = await tx.select().from(facture).where(and(eq(facture.id, p.factureId), eq(facture.entrepriseId, p.entrepriseId)));
  if (!laFacture) return { erreur: m("Cette facture est introuvable.") };
  if (laFacture.statut === "PAYEE") return { erreur: m("Cette facture est déjà réglée.") };
  if (laFacture.statut === "ANNULEE") return { erreur: m("Cette facture a été annulée.") };

  const { solde } = await lireSolde(tx, laFacture.id, laFacture.montantTTC);
  const montant = determinerMontantPromesse(solde, p.montant);
  if ("erreur" in montant) return { erreur: montant.erreur };

  await tx
    .update(promessePaiement)
    .set({ statut: "ANNULEE", resolueLe: new Date() })
    .where(and(eq(promessePaiement.factureId, laFacture.id), eq(promessePaiement.statut, "EN_COURS")));

  const [creee] = await tx
    .insert(promessePaiement)
    .values({
      entrepriseId: p.entrepriseId,
      factureId: laFacture.id,
      contactId: laFacture.contactId,
      datePromise: p.datePromise,
      montant: montant.montant,
      canal: p.canal,
      source: p.source,
      note: p.note,
      creeParId: p.creeParId,
      clientIp: p.clientIp,
    })
    .returning();

  const [leContact] = laFacture.contactId ? await tx.select({ nom: contact.nom }).from(contact).where(eq(contact.id, laFacture.contactId)) : [];
  const origine = p.source === "CLIENT" ? "annoncé par le client sur la page de la facture" : "";
  await journaliser(tx, {
    entrepriseId: p.entrepriseId,
    contactId: laFacture.contactId,
    type: p.canal === "client" || p.canal === "autre" ? "note" : p.canal,
    contenu: `Promesse de paiement — facture ${laFacture.numero} : ${formaterFCFA(montant.montant)} avant le ${dateFr(p.datePromise)}${origine ? ` (${origine})` : ""}${p.note ? ` — « ${p.note} »` : ""}`,
    auteurId: p.creeParId,
  });

  return { promesse: creee, numeroFacture: laFacture.numero, assigneAId: laFacture.assigneAId, contactId: laFacture.contactId, nomClient: leContact?.nom ?? null };
}

/** Annule la promesse en cours d'une facture (retirée par l'équipe). Renvoie vrai si une promesse a été annulée. */
export async function annulerPromesseEnCours(tx: TransactionDrizzle, entrepriseId: string, factureId: string): Promise<boolean> {
  const annulees = await tx
    .update(promessePaiement)
    .set({ statut: "ANNULEE", resolueLe: new Date() })
    .where(and(eq(promessePaiement.entrepriseId, entrepriseId), eq(promessePaiement.factureId, factureId), eq(promessePaiement.statut, "EN_COURS")))
    .returning({ id: promessePaiement.id });
  return annulees.length > 0;
}

/**
 * À appeler après tout règlement enregistré sur une facture (paiement Mobile Money, pointage manuel, acompte déduit…) : si la
 * promesse en cours est tenue — facture soldée, ou règlements depuis la promesse couvrant le montant promis — elle passe à TENUE.
 * Une facture annulée annule aussi sa promesse. Sans promesse en cours, ne fait rien (aucune requête inutile au-delà de la lecture).
 * Le balayage quotidien (traiterPromessesEchues) rattrape tout oubli d'un chemin de règlement.
 */
export async function resoudrePromessesFacture(tx: TransactionDrizzle, entrepriseId: string, factureId: string): Promise<"TENUE" | "ANNULEE" | null> {
  const promesse = await promesseEnCours(tx, factureId);
  if (!promesse || promesse.entrepriseId !== entrepriseId) return null;

  const [laFacture] = await tx.select({ statut: facture.statut, montantTTC: facture.montantTTC }).from(facture).where(and(eq(facture.id, factureId), eq(facture.entrepriseId, entrepriseId)));
  if (!laFacture) return null;
  if (laFacture.statut === "ANNULEE") {
    await tx.update(promessePaiement).set({ statut: "ANNULEE", resolueLe: new Date() }).where(eq(promessePaiement.id, promesse.id));
    return "ANNULEE";
  }

  const { solde } = await lireSolde(tx, factureId, laFacture.montantTTC);
  const depuis = new Date(promesse.creeLe.getTime() - TOLERANCE_HORLOGE_MS);
  const reglements = await tx.select({ montant: paiement.montant }).from(paiement).where(and(eq(paiement.factureId, factureId), gte(paiement.datePaiement, depuis)));
  const payeDepuis = reglements.reduce((somme, r) => somme + r.montant, 0);

  if (!promesseTenue({ montantPromis: promesse.montant, solde, payeDepuis })) return null;
  await tx.update(promessePaiement).set({ statut: "TENUE", resolueLe: new Date() }).where(eq(promessePaiement.id, promesse.id));
  return "TENUE";
}

export type ResultatTraitementPromesses = { tenues: number; nonTenues: number; alertes: number };

/**
 * Balayage quotidien d'une entreprise (tâche planifiée, AVANT les relances) : chaque promesse en cours est d'abord réévaluée
 * (tenue ?), puis déclarée NON_TENUE si sa date plus le jour de grâce est dépassée sans paiement suffisant. Pour une promesse
 * non tenue : alerte par email (une seule fois) à la personne qui l'avait notée — ou, pour une promesse du client, au responsable
 * de la facture — et aux Administrateurs ; ligne dans l'historique du contact. La relance de la facture, suspendue pendant la
 * promesse, reprend aussitôt (marquerFacturesEnRetard tourne juste après).
 */
export async function traiterPromessesEchues(tx: TransactionDrizzle, entrepriseId: string, maintenant: Date = new Date()): Promise<ResultatTraitementPromesses> {
  const resultat: ResultatTraitementPromesses = { tenues: 0, nonTenues: 0, alertes: 0 };
  const aujourdhui = aujourdhuiDouala(maintenant);
  const enCours = await tx
    .select()
    .from(promessePaiement)
    .where(and(eq(promessePaiement.entrepriseId, entrepriseId), eq(promessePaiement.statut, "EN_COURS")))
    .orderBy(asc(promessePaiement.datePromise))
    .limit(500);

  for (const promesse of enCours) {
    const issue = await resoudrePromessesFacture(tx, entrepriseId, promesse.factureId);
    if (issue === "TENUE") {
      resultat.tenues++;
      continue;
    }
    if (issue === "ANNULEE" || !promesseEchue(promesse.datePromise, aujourdhui)) continue;

    await tx.update(promessePaiement).set({ statut: "NON_TENUE", resolueLe: maintenant }).where(and(eq(promessePaiement.id, promesse.id), eq(promessePaiement.statut, "EN_COURS")));
    resultat.nonTenues++;

    const [laFacture] = await tx.select({ numero: facture.numero, assigneAId: facture.assigneAId, montantTTC: facture.montantTTC, contactId: facture.contactId }).from(facture).where(eq(facture.id, promesse.factureId));
    if (!laFacture) continue;
    const { solde } = await lireSolde(tx, promesse.factureId, laFacture.montantTTC);
    // Le contact de la promesse, sinon celui de la facture (toujours connu).
    const idContact = promesse.contactId ?? laFacture.contactId;
    const [leContact] = idContact ? await tx.select({ nom: contact.nom }).from(contact).where(eq(contact.id, idContact)) : [];
    const nomClient = leContact?.nom ?? "Le client";

    await journaliser(tx, {
      entrepriseId,
      contactId: idContact,
      type: "note",
      contenu: `Promesse de paiement non tenue — facture ${laFacture.numero} : ${formaterFCFA(promesse.montant)} promis avant le ${dateFr(promesse.datePromise)}, il reste ${formaterFCFA(solde)} à régler. Les relances reprennent.`,
      auteurId: null,
    });

    if (!promesse.alerteLe) {
      const adresses = await adressesAAlerter(tx, entrepriseId, [promesse.creeParId ?? laFacture.assigneAId]);
      await alerterParEmail(
        adresses,
        `Promesse de paiement non tenue — facture ${laFacture.numero}`,
        `<p>${echapper(nomClient)} avait promis de régler <strong>${formaterFCFA(promesse.montant)}</strong> avant le <strong>${dateFr(promesse.datePromise)}</strong> pour la facture ${echapper(laFacture.numero)}, et le paiement n'est pas arrivé (il reste ${formaterFCFA(solde)}).</p><p>Les relances automatiques de cette facture reprennent. Vous pouvez aussi rappeler le client et noter une nouvelle promesse depuis la fiche de la facture.</p>`
      );
      await tx.update(promessePaiement).set({ alerteLe: maintenant }).where(eq(promessePaiement.id, promesse.id));
      resultat.alertes++;
    }
  }
  return resultat;
}

/** Promesses en cours attendues dans les `jours` prochains jours (et celles déjà échues, pas encore traitées) : l'encart du suivi. */
export async function promessesAttendues(
  tx: TransactionDrizzle,
  entrepriseId: string,
  options: { jours: number; assigneAIds?: string[] | "TOUT" }
): Promise<{ id: string; factureId: string; numero: string; contactId: string | null; nomClient: string | null; datePromise: string; montant: number; canal: string; source: string }[]> {
  const limite = new Date(Date.now() + options.jours * 86_400_000);
  const jourLimite = aujourdhuiDouala(limite);
  const lignes = await tx
    .select({
      id: promessePaiement.id,
      factureId: promessePaiement.factureId,
      numero: facture.numero,
      assigneAId: facture.assigneAId,
      contactId: promessePaiement.contactId,
      nomClient: contact.nom,
      datePromise: promessePaiement.datePromise,
      montant: promessePaiement.montant,
      canal: promessePaiement.canal,
      source: promessePaiement.source,
    })
    .from(promessePaiement)
    .innerJoin(facture, eq(promessePaiement.factureId, facture.id))
    .leftJoin(contact, eq(promessePaiement.contactId, contact.id))
    .where(and(eq(promessePaiement.entrepriseId, entrepriseId), eq(promessePaiement.statut, "EN_COURS")))
    .orderBy(asc(promessePaiement.datePromise))
    .limit(200);
  const visibles = options.assigneAIds;
  return lignes
    .filter((l) => l.datePromise <= jourLimite && (visibles === undefined || visibles === "TOUT" || visibles.includes(l.assigneAId)))
    .map((l) => ({ id: l.id, factureId: l.factureId, numero: l.numero, contactId: l.contactId, nomClient: l.nomClient, datePromise: l.datePromise, montant: l.montant, canal: l.canal, source: l.source }));
}

/** Pour une liste de factures : la date de leur promesse en cours (badge de la liste). */
export async function promessesEnCoursDesFactures(tx: TransactionDrizzle, entrepriseId: string, idsFactures: string[]): Promise<Map<string, { datePromise: string; montant: number }>> {
  const parFacture = new Map<string, { datePromise: string; montant: number }>();
  if (idsFactures.length === 0) return parFacture;
  const lignes = await tx
    .select({ factureId: promessePaiement.factureId, datePromise: promessePaiement.datePromise, montant: promessePaiement.montant })
    .from(promessePaiement)
    .where(and(eq(promessePaiement.entrepriseId, entrepriseId), eq(promessePaiement.statut, "EN_COURS"), inArray(promessePaiement.factureId, idsFactures)));
  for (const l of lignes) parFacture.set(l.factureId, { datePromise: l.datePromise, montant: l.montant });
  return parFacture;
}
