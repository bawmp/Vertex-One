import { erreurDateNaissance, lireJour } from "./anniversaires-regles";

export const CONTRATS_COLLABORATEUR = ["CDI", "CDD", "STAGE", "PRESTATAIRE"] as const;
export type ContratCollaborateur = (typeof CONTRATS_COLLABORATEUR)[number];
export const LIBELLE_CONTRAT: Record<ContratCollaborateur, string> = { CDI: "Employé (CDI)", CDD: "Employé (CDD)", STAGE: "Stagiaire professionnel", PRESTATAIRE: "Prestataire / freelance" };

export type SaisieNouveauCollaborateur = { email: string; poste: string; typeContrat: string; dateEmbauche: string; dateFin: string; dateNaissance: string };
export type NouveauCollaborateurValide = { email: string; poste: string; typeContrat: ContratCollaborateur; dateEmbauche: string; dateFin: string | null; dateNaissance: string | null };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Règle pure : contrôle la saisie de création d'une fiche collaborateur. Un CDD, un stage ou une mission de prestataire a toujours une fin
 * (postérieure au début) ; la date de naissance, facultative, doit être réelle et plausible. Aucune notion de salaire ici, volontairement.
 */
export function validerNouveauCollaborateur(s: SaisieNouveauCollaborateur, aujourdhui: string): { ok: true; valeurs: NouveauCollaborateurValide } | { ok: false; erreur: string } {
  const email = s.email.trim().toLowerCase();
  if (!EMAIL.test(email) || email.length > 200) return { ok: false, erreur: "Adresse email invalide." };
  const poste = s.poste.replace(/\s+/g, " ").trim();
  if (poste.length < 2 || poste.length > 120) return { ok: false, erreur: "Indiquez le poste (2 à 120 caractères)." };
  if (!(CONTRATS_COLLABORATEUR as readonly string[]).includes(s.typeContrat)) return { ok: false, erreur: "Type de collaborateur inconnu." };
  const typeContrat = s.typeContrat as ContratCollaborateur;
  if (!lireJour(s.dateEmbauche)) return { ok: false, erreur: "La date d'arrivée n'est pas valide." };
  const avecFin = typeContrat !== "CDI";
  const dateFin = s.dateFin.trim();
  if (avecFin && !dateFin) return { ok: false, erreur: typeContrat === "STAGE" ? "Indiquez la date de fin du stage." : typeContrat === "CDD" ? "Indiquez la date de fin du CDD." : "Indiquez la date de fin de la mission." };
  if (dateFin) {
    if (!lireJour(dateFin)) return { ok: false, erreur: "La date de fin n'est pas valide." };
    if (dateFin <= s.dateEmbauche) return { ok: false, erreur: "La fin doit être postérieure à la date d'arrivée." };
  }
  const naissance = s.dateNaissance.trim();
  if (naissance) {
    const e = erreurDateNaissance(naissance, aujourdhui);
    if (e) return { ok: false, erreur: e };
  }
  return { ok: true, valeurs: { email, poste, typeContrat, dateEmbauche: s.dateEmbauche, dateFin: dateFin || null, dateNaissance: naissance || null } };
}
