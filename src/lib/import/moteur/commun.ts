import { and, eq, ne } from "drizzle-orm";
import type { TransactionDrizzle } from "@/db/client";
import { utilisateur } from "@/db/schema";
import { normaliser } from "../valeurs";
import { m } from "@/lib/i18n/catalogue";

/** Une ligne du fichier une fois ses colonnes associées aux champs (`numero` = numéro de ligne dans le tableur, en-têtes = ligne 1). */
export type LigneImport = { numero: number; v: Record<string, string> };

export type Valeurs = Record<string, string | number>;

/** `message` est un texte français à traduire à l'affichage avec `t(message, valeurs)` (les {paramètres} y sont remplacés). */
export type Probleme = { ligne: number; message: string; valeurs?: Valeurs };

export type Rapport = {
  crees: number;
  ignores: number;
  nbErreurs: number;
  /** Les 100 premières erreurs seulement : le compte complet est dans `nbErreurs`. */
  erreurs: Probleme[];
  avertissements: Probleme[];
  /** Compteurs annexes (sociétés créées, projets créés…). */
  resume: { libelle: string; nombre: number }[];
};

export type OptionsImport = {
  /** PROJETS_TACHES : client auquel rattacher les projets créés ; « NOUVEAU » crée un client « Projets importés ». */
  contactProjetsId?: string;
};

export type ContexteImport = {
  tx: TransactionDrizzle;
  entrepriseId: string;
  utilisateurId: string;
  /** Portée de l'importateur sur le CRM (voir `idsVisibles`) : "TOUT" ou la liste des responsables qu'il peut voir. */
  visibleCrm: "TOUT" | string[];
  options: OptionsImport;
  utilisateurs: UtilisateurEquipe[];
  /** Responsables cités dans le fichier mais introuvables dans l'équipe (remplacés par l'importateur). */
  responsablesInconnus: Set<string>;
};

export type UtilisateurEquipe = { id: string; email: string; nom: string };

const MAX_ERREURS_RENVOYEES = 100;
export const TAILLE_LOT = 200;

export function nouveauRapport(): Rapport {
  return { crees: 0, ignores: 0, nbErreurs: 0, erreurs: [], avertissements: [], resume: [] };
}

export function erreur(rapport: Rapport, ligne: number, message: string, valeurs?: Valeurs) {
  rapport.nbErreurs++;
  if (rapport.erreurs.length < MAX_ERREURS_RENVOYEES) rapport.erreurs.push({ ligne, message, valeurs });
}

export function avertir(rapport: Rapport, ligne: number, message: string, valeurs?: Valeurs) {
  if (rapport.avertissements.length < MAX_ERREURS_RENVOYEES) rapport.avertissements.push({ ligne, message, valeurs });
}

export function compter(rapport: Rapport, libelle: string, nombre: number) {
  if (nombre > 0) rapport.resume.push({ libelle, nombre });
}

export function lots<T>(elements: T[], taille = TAILLE_LOT): T[][] {
  const resultat: T[][] = [];
  for (let i = 0; i < elements.length; i += taille) resultat.push(elements.slice(i, i + taille));
  return resultat;
}

/** Membres actifs de L'entreprise courante (jamais un client du portail) : seuls candidats possibles à un « responsable » du fichier. */
export async function chargerEquipe(tx: TransactionDrizzle, entrepriseId: string): Promise<UtilisateurEquipe[]> {
  // La table utilisateur reste en RLS permissive (Better-Auth) : le filtre sur l'entreprise est donc explicite ici.
  const lignes = await tx
    .select({ id: utilisateur.id, email: utilisateur.email, nom: utilisateur.nomComplet })
    .from(utilisateur)
    .where(and(eq(utilisateur.entrepriseId, entrepriseId), eq(utilisateur.statut, "ACTIF"), ne(utilisateur.role, "CLIENT")));
  return lignes;
}

/** Responsable désigné par un email ou un nom ; à défaut (ou si introuvable), la personne qui importe. */
export function resoudreResponsable(ctx: ContexteImport, email: string | undefined, nom: string | undefined): string {
  const e = (email ?? "").trim().toLowerCase();
  if (e) {
    const trouve = ctx.utilisateurs.find((u) => u.email.toLowerCase() === e);
    if (trouve) return trouve.id;
  }
  const n = normaliser(nom ?? "");
  if (n) {
    const trouve = ctx.utilisateurs.find((u) => normaliser(u.nom) === n);
    if (trouve) return trouve.id;
  }
  const cite = (email ?? "").trim() || (nom ?? "").trim();
  if (cite) ctx.responsablesInconnus.add(cite);
  return ctx.utilisateurId;
}

export function avertirResponsablesInconnus(ctx: ContexteImport, rapport: Rapport) {
  if (ctx.responsablesInconnus.size === 0) return;
  const liste = [...ctx.responsablesInconnus].slice(0, 10).join(", ");
  const suite = ctx.responsablesInconnus.size > 10 ? `… (${ctx.responsablesInconnus.size})` : "";
  avertir(rapport, 0, m("Responsables absents de votre équipe, remplacés par vous : {liste}{suite}."), { liste, suite });
}

export const EMAIL_VALIDE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Chiffres seuls d'un numéro : sert à reconnaître un même téléphone écrit différemment (avec ou sans +237, espaces…). */
export function chiffresTelephone(tel: string | null | undefined): string {
  const c = (tel ?? "").replace(/\D/g, "");
  return c.length >= 8 ? c.slice(-9) : ""; // les 9 derniers chiffres : identiques avec ou sans indicatif
}

export const TELEPHONE_ABSENT = "Non renseigné";
