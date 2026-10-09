import { and, asc, count, eq, inArray } from "drizzle-orm";
import type { AnyPgColumn, PgTable } from "drizzle-orm/pg-core";
import type { TransactionDrizzle } from "@/db/client";
import {
  compteClient,
  contact,
  contactChampPersonnalise,
  deal,
  devis,
  facture,
  ligneDevis,
  ligneFacture,
  lead,
  modeleEmail,
  paiement,
  produit,
  utilisateur,
} from "@/db/schema";
import { LIBELLE_TYPE_CHAMP_CONTACT } from "@/lib/contact-champs-personnalises-types";
import { DEFINITIONS, type TypeImport } from "@/lib/import/definitions";
import { LIBELLE_MODELE_EMAIL } from "@/lib/import/moteur/modeles-email";
import { STATUT_DEAL, STATUT_DEVIS, STATUT_FACTURE, STATUT_LEAD } from "@/lib/libelles";
import { TELEPHONE_ABSENT } from "@/lib/import/moteur/commun";

/**
 * Export des données d'un espace, dans des fichiers que l'assistant d'import (Paramètres → Importer des données) relit
 * TELS QUELS dans un autre espace : chaque en-tête est le libellé du champ d'import correspondant, les dates sont au
 * format AAAA-MM-JJ, les montants sont des francs CFA entiers, les statuts sont écrits en français comme à l'écran.
 *
 * Ce qui n'est PAS exporté, volontairement : les pièces jointes et les pièces privées (identité, santé) — des fichiers,
 * pas des lignes de tableur ; les valeurs saisies dans les champs personnalisés des contacts (seule leur structure l'est) ;
 * les mots de passe, jetons et clés d'API ; les comptes utilisateurs. À appeler dans `avecEntreprise` (RLS de l'espace).
 */
export const TYPES_EXPORT = ["CONTACTS", "LEADS", "DEALS", "PRODUITS", "DEVIS", "FACTURES", "CHAMPS_CONTACT", "MODELES_EMAIL"] as const satisfies readonly TypeImport[];
export type TypeExport = (typeof TYPES_EXPORT)[number];

export type JeuDonnees = { entetes: string[]; lignes: string[][] };

export const NOM_FICHIER_EXPORT: Record<TypeExport, string> = {
  CONTACTS: "contacts",
  LEADS: "leads",
  DEALS: "deals",
  PRODUITS: "produits",
  DEVIS: "devis",
  FACTURES: "factures",
  CHAMPS_CONTACT: "champs-personnalises",
  MODELES_EMAIL: "modeles-email",
};

const TAILLE_LOT_IDS = 500;

function entete(type: TypeImport, cle: string): string {
  const champ = DEFINITIONS[type].champs.find((c) => c.cle === cle);
  if (!champ) throw new Error(`Champ d'import inconnu : ${type}.${cle}`);
  return champ.libelle;
}

const jour = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : "");
const nombre = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(n));
const propre = (t: string | null | undefined) => (t && t !== TELEPHONE_ABSENT ? t : "");

function morceaux<T>(elements: T[], taille = TAILLE_LOT_IDS): T[][] {
  const resultat: T[][] = [];
  for (let i = 0; i < elements.length; i += taille) resultat.push(elements.slice(i, i + taille));
  return resultat;
}

/** Email des responsables (le fichier porte un email : stable d'un espace à l'autre, contrairement à un identifiant). */
async function emailsEquipe(tx: TransactionDrizzle, entrepriseId: string): Promise<Map<string, string>> {
  // `utilisateur` est en RLS permissive (Better-Auth) : l'entreprise est filtrée explicitement.
  const lignes = await tx.select({ id: utilisateur.id, email: utilisateur.email }).from(utilisateur).where(eq(utilisateur.entrepriseId, entrepriseId));
  return new Map(lignes.map((u) => [u.id, u.email]));
}

async function exporterContacts(tx: TransactionDrizzle, entrepriseId: string): Promise<JeuDonnees> {
  const [contacts, comptes, equipe] = await Promise.all([
    tx.select().from(contact).where(eq(contact.entrepriseId, entrepriseId)).orderBy(asc(contact.nom)),
    tx.select({ id: compteClient.id, nom: compteClient.nom, niu: compteClient.niu }).from(compteClient).where(eq(compteClient.entrepriseId, entrepriseId)),
    emailsEquipe(tx, entrepriseId),
  ]);
  const compteParId = new Map(comptes.map((c) => [c.id, c]));
  return {
    entetes: ["nom", "entreprise", "email", "telephone", "fonction", "niu", "notes", "proprietaire"].map((c) => entete("CONTACTS", c)),
    lignes: contacts.map((c) => {
      const compte = c.compteId ? compteParId.get(c.compteId) : undefined;
      return [c.nom, compte?.nom ?? "", c.email ?? "", propre(c.telephone), c.fonction ?? "", compte?.niu ?? "", c.notes ?? "", equipe.get(c.assigneAId) ?? ""];
    }),
  };
}

async function exporterLeads(tx: TransactionDrizzle, entrepriseId: string): Promise<JeuDonnees> {
  const [leads, equipe] = await Promise.all([tx.select().from(lead).where(eq(lead.entrepriseId, entrepriseId)).orderBy(asc(lead.creeLe)), emailsEquipe(tx, entrepriseId)]);
  return {
    entetes: ["nom", "societe", "email", "telephone", "statut", "notes", "proprietaire"].map((c) => entete("LEADS", c)),
    lignes: leads.map((l) => [l.nom, l.societeCliente ?? "", l.email ?? "", propre(l.telephone), STATUT_LEAD[l.statut]?.libelle ?? l.statut, l.notes ?? "", equipe.get(l.assigneAId) ?? ""]),
  };
}

async function exporterDeals(tx: TransactionDrizzle, entrepriseId: string): Promise<JeuDonnees> {
  const [deals, contacts, equipe] = await Promise.all([
    tx.select().from(deal).where(eq(deal.entrepriseId, entrepriseId)).orderBy(asc(deal.creeLe)),
    tx.select({ id: contact.id, nom: contact.nom, email: contact.email, telephone: contact.telephone }).from(contact).where(eq(contact.entrepriseId, entrepriseId)),
    emailsEquipe(tx, entrepriseId),
  ]);
  const contactParId = new Map(contacts.map((c) => [c.id, c]));
  return {
    entetes: ["titre", "contact", "contactEmail", "contactTelephone", "montant", "statut", "dateCloture", "proprietaire"].map((c) => entete("DEALS", c)),
    lignes: deals.map((d) => {
      const c = contactParId.get(d.contactId);
      return [d.titre, c?.nom ?? "", c?.email ?? "", propre(c?.telephone), nombre(d.montant), STATUT_DEAL[d.statut]?.libelle ?? d.statut, jour(d.dateClotureEstimee), equipe.get(d.assigneAId) ?? ""];
    }),
  };
}

async function exporterProduits(tx: TransactionDrizzle, entrepriseId: string): Promise<JeuDonnees> {
  const produits = await tx.select().from(produit).where(eq(produit.entrepriseId, entrepriseId)).orderBy(asc(produit.nom));
  return {
    entetes: ["nom", "description", "type", "prixVente", "prixAchat", "stock"].map((c) => entete("PRODUITS", c)),
    lignes: produits.map((p) => [p.nom, p.description ?? "", p.type === "BIEN" ? "Bien" : "Service", nombre(p.prixVente), nombre(p.prixAchat), p.suiviStock ? nombre(p.stockActuel) : ""]),
  };
}

type LigneDocument = { designation: string; quantite: number; prixUnitaire: number; tauxTVA: number };

/** Une ligne de fichier par ligne de détail (plusieurs lignes portant le même numéro forment un seul document à l'import). */
function lignesDocument(type: "DEVIS" | "FACTURES", base: string[], fin: string[], detail: LigneDocument[], totaux: { ht: number; ttc: number }): string[][] {
  if (detail.length === 0) {
    // Document sans détail : seuls les totaux sont connus, l'import les reprend tels quels.
    return [[...base, "", "", "", "", String(totaux.ht), String(totaux.ttc), ...fin]];
  }
  return detail.map((l) => [...base, l.designation, String(l.quantite), String(l.prixUnitaire), String(l.tauxTVA), "", "", ...fin]);
}

async function exporterDevis(tx: TransactionDrizzle, entrepriseId: string): Promise<JeuDonnees> {
  const [liste, contacts] = await Promise.all([
    tx.select().from(devis).where(eq(devis.entrepriseId, entrepriseId)).orderBy(asc(devis.creeLe)),
    tx.select({ id: contact.id, nom: contact.nom, email: contact.email, telephone: contact.telephone }).from(contact).where(eq(contact.entrepriseId, entrepriseId)),
  ]);
  const contactParId = new Map(contacts.map((c) => [c.id, c]));
  const detailParDevis = new Map<string, LigneDocument[]>();
  for (const lot of morceaux(liste.map((d) => d.id))) {
    const lignes = await tx.select().from(ligneDevis).where(and(eq(ligneDevis.entrepriseId, entrepriseId), inArray(ligneDevis.devisId, lot)));
    for (const l of lignes) {
      const tableau = detailParDevis.get(l.devisId) ?? [];
      tableau.push({ designation: l.designation, quantite: l.quantite, prixUnitaire: l.prixUnitaire, tauxTVA: l.tauxTVA });
      detailParDevis.set(l.devisId, tableau);
    }
  }
  const cles = ["numero", "client", "clientEmail", "clientTelephone", "date", "designation", "quantite", "prixUnitaire", "tauxTVA", "totalHT", "totalTTC", "echeance", "statut"];
  return {
    entetes: cles.map((c) => entete("DEVIS", c)),
    lignes: liste.flatMap((d) => {
      const c = contactParId.get(d.contactId);
      const base = [d.numero, c?.nom ?? "", c?.email ?? "", propre(c?.telephone), jour(d.creeLe)];
      const fin = [jour(d.dateValidite), STATUT_DEVIS[d.statut]?.libelle ?? d.statut];
      return lignesDocument("DEVIS", base, fin, detailParDevis.get(d.id) ?? [], { ht: d.montantHT, ttc: d.montantTTC });
    }),
  };
}

async function exporterFactures(tx: TransactionDrizzle, entrepriseId: string): Promise<JeuDonnees> {
  const [liste, contacts] = await Promise.all([
    tx.select().from(facture).where(eq(facture.entrepriseId, entrepriseId)).orderBy(asc(facture.dateEmission)),
    tx.select({ id: contact.id, nom: contact.nom, email: contact.email, telephone: contact.telephone }).from(contact).where(eq(contact.entrepriseId, entrepriseId)),
  ]);
  const contactParId = new Map(contacts.map((c) => [c.id, c]));
  const detailParFacture = new Map<string, LigneDocument[]>();
  const payeParFacture = new Map<string, { total: number; dernierLe: Date | null }>();
  for (const lot of morceaux(liste.map((f) => f.id))) {
    const lignes = await tx.select().from(ligneFacture).where(and(eq(ligneFacture.entrepriseId, entrepriseId), inArray(ligneFacture.factureId, lot)));
    for (const l of lignes) {
      const tableau = detailParFacture.get(l.factureId) ?? [];
      tableau.push({ designation: l.designation, quantite: l.quantite, prixUnitaire: l.prixUnitaire, tauxTVA: l.tauxTVA });
      detailParFacture.set(l.factureId, tableau);
    }
    const paiements = await tx.select().from(paiement).where(and(eq(paiement.entrepriseId, entrepriseId), inArray(paiement.factureId, lot)));
    for (const p of paiements) {
      const courant = payeParFacture.get(p.factureId) ?? { total: 0, dernierLe: null };
      courant.total += p.montant;
      if (!courant.dernierLe || p.datePaiement > courant.dernierLe) courant.dernierLe = p.datePaiement;
      payeParFacture.set(p.factureId, courant);
    }
  }
  const cles = ["numero", "client", "clientEmail", "clientTelephone", "date", "designation", "quantite", "prixUnitaire", "tauxTVA", "totalHT", "totalTTC", "echeance", "statut", "montantPaye", "datePaiement"];
  return {
    entetes: cles.map((c) => entete("FACTURES", c)),
    lignes: liste.flatMap((f) => {
      const c = contactParId.get(f.contactId);
      const paye = payeParFacture.get(f.id);
      const base = [f.numero, c?.nom ?? "", c?.email ?? "", propre(c?.telephone), jour(f.dateEmission)];
      const fin = [jour(f.dateEcheance), STATUT_FACTURE[f.statut]?.libelle ?? f.statut, paye ? String(paye.total) : "", jour(paye?.dernierLe)];
      return lignesDocument("FACTURES", base, fin, detailParFacture.get(f.id) ?? [], { ht: f.montantHT, ttc: f.montantTTC });
    }),
  };
}

async function exporterChampsContact(tx: TransactionDrizzle, entrepriseId: string): Promise<JeuDonnees> {
  const champs = await tx.select().from(contactChampPersonnalise).where(eq(contactChampPersonnalise.entrepriseId, entrepriseId)).orderBy(asc(contactChampPersonnalise.ordre));
  return {
    entetes: ["libelle", "type", "obligatoire", "options"].map((c) => entete("CHAMPS_CONTACT", c)),
    lignes: champs.map((c) => [c.libelle, LIBELLE_TYPE_CHAMP_CONTACT[c.type], c.obligatoire ? "Oui" : "Non", (c.options ?? []).join(" | ")]),
  };
}

async function exporterModelesEmail(tx: TransactionDrizzle, entrepriseId: string): Promise<JeuDonnees> {
  const modeles = await tx.select().from(modeleEmail).where(eq(modeleEmail.entrepriseId, entrepriseId));
  return {
    entetes: ["type", "objet", "corps"].map((c) => entete("MODELES_EMAIL", c)),
    lignes: modeles.map((mo) => [LIBELLE_MODELE_EMAIL[mo.type], mo.objet, mo.corps]),
  };
}

export async function exporterDonnees(tx: TransactionDrizzle, entrepriseId: string, type: TypeExport): Promise<JeuDonnees> {
  switch (type) {
    case "CONTACTS":
      return exporterContacts(tx, entrepriseId);
    case "LEADS":
      return exporterLeads(tx, entrepriseId);
    case "DEALS":
      return exporterDeals(tx, entrepriseId);
    case "PRODUITS":
      return exporterProduits(tx, entrepriseId);
    case "DEVIS":
      return exporterDevis(tx, entrepriseId);
    case "FACTURES":
      return exporterFactures(tx, entrepriseId);
    case "CHAMPS_CONTACT":
      return exporterChampsContact(tx, entrepriseId);
    case "MODELES_EMAIL":
      return exporterModelesEmail(tx, entrepriseId);
  }
}

/** Nombre d'éléments par type, pour l'écran d'export (devis et factures : nombre de documents, pas de lignes). */
export async function compterDonnees(tx: TransactionDrizzle, entrepriseId: string): Promise<Record<TypeExport, number>> {
  const nb = async (table: PgTable, colonne: AnyPgColumn) => Number((await tx.select({ n: count() }).from(table).where(eq(colonne, entrepriseId)))[0]?.n ?? 0);
  const [contacts, leads, deals, produits, devisN, factures, champs, modeles] = await Promise.all([
    nb(contact, contact.entrepriseId),
    nb(lead, lead.entrepriseId),
    nb(deal, deal.entrepriseId),
    nb(produit, produit.entrepriseId),
    nb(devis, devis.entrepriseId),
    nb(facture, facture.entrepriseId),
    nb(contactChampPersonnalise, contactChampPersonnalise.entrepriseId),
    nb(modeleEmail, modeleEmail.entrepriseId),
  ]);
  return { CONTACTS: contacts, LEADS: leads, DEALS: deals, PRODUITS: produits, DEVIS: devisN, FACTURES: factures, CHAMPS_CONTACT: champs, MODELES_EMAIL: modeles };
}
