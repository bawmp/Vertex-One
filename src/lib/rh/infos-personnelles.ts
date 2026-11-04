import { m } from "@/lib/i18n/catalogue";
import { and, eq } from "drizzle-orm";
import type { TransactionDrizzle } from "@/db/client";
import { dossierRH } from "@/db/schema";
import { idsVisibles } from "@/lib/portee";
import { peut } from "@/lib/permissions";
import type { UtilisateurConnecte } from "@/lib/session";
import { erreurDateNaissance } from "./anniversaires-regles";

/** Informations personnelles d'une fiche collaborateur : date de naissance, coordonnées et personne à prévenir. Jamais le salaire. */
export type SaisieInfosPersonnelles = { dateNaissance: string; telephone: string; adresse: string; urgenceNom: string; urgenceTelephone: string };
export type InfosValidees = { dateNaissance: string | null; telephone: string | null; adresse: string | null; urgenceNom: string | null; urgenceTelephone: string | null };

const TELEPHONE = /^[+\d\s().-]{5,30}$/;
const propre = (v: string) => v.replace(/\s+/g, " ").trim();

/** Règle pure : champs vides = effacés ; chaque valeur est contrôlée (date réelle et plausible, téléphone, longueurs). */
export function validerInfosPersonnelles(s: SaisieInfosPersonnelles, aujourdhui: string): { ok: true; valeurs: InfosValidees } | { ok: false; erreur: string } {
  const naissance = s.dateNaissance.trim();
  if (naissance) {
    const e = erreurDateNaissance(naissance, aujourdhui);
    if (e) return { ok: false, erreur: e };
  }
  const telephone = propre(s.telephone);
  const urgenceTelephone = propre(s.urgenceTelephone);
  if (telephone && !TELEPHONE.test(telephone)) return { ok: false, erreur: m("Le téléphone n'est pas valide.") };
  if (urgenceTelephone && !TELEPHONE.test(urgenceTelephone)) return { ok: false, erreur: m("Le téléphone de la personne à prévenir n'est pas valide.") };
  const adresse = propre(s.adresse);
  const urgenceNom = propre(s.urgenceNom);
  if (adresse.length > 200) return { ok: false, erreur: m("L'adresse est trop longue (200 caractères au maximum).") };
  if (urgenceNom.length > 120) return { ok: false, erreur: m("Le nom de la personne à prévenir est trop long.") };
  return { ok: true, valeurs: { dateNaissance: naissance || null, telephone: telephone || null, adresse: adresse || null, urgenceNom: urgenceNom || null, urgenceTelephone: urgenceTelephone || null } };
}

/**
 * Qui peut modifier ces informations : la personne elle-même, l'Administrateur, ou un Manager dont la portée RH couvre la personne.
 * (Le contrat, le poste et le salaire restent réservés à l'Administrateur ; ceci n'y touche pas.)
 */
export function peutModifierInfos(u: UtilisateurConnecte, proprietaireId: string, idsPortee: "TOUT" | string[]): boolean {
  if (u.utilisateurId === proprietaireId || u.role === "ADMIN") return true;
  return u.role === "MANAGER" && peut(u, "RH", "MODIFIER") && (idsPortee === "TOUT" || idsPortee.includes(proprietaireId));
}

export async function modifierInfosPersonnelles(tx: TransactionDrizzle, u: UtilisateurConnecte, dossierRHId: string, saisie: SaisieInfosPersonnelles, aujourdhui: string): Promise<{ ok: true } | { ok: false; erreur: string }> {
  const verdict = validerInfosPersonnelles(saisie, aujourdhui);
  if (!verdict.ok) return verdict;
  const [d] = await tx.select({ utilisateurId: dossierRH.utilisateurId }).from(dossierRH).where(and(eq(dossierRH.id, dossierRHId), eq(dossierRH.entrepriseId, u.entrepriseId)));
  if (!d) return { ok: false, erreur: m("Fiche introuvable.") };
  const ids = u.utilisateurId === d.utilisateurId || u.role === "ADMIN" ? "TOUT" : await idsVisibles(tx, u, "RH");
  if (!peutModifierInfos(u, d.utilisateurId, ids)) return { ok: false, erreur: m("Vous n'avez pas le droit de modifier ces informations.") };
  await tx.update(dossierRH).set(verdict.valeurs).where(and(eq(dossierRH.id, dossierRHId), eq(dossierRH.entrepriseId, u.entrepriseId)));
  return { ok: true };
}
