import { m } from "@/lib/i18n/catalogue";
import { jourValide } from "@/lib/rh/paie-regles";

/**
 * Règles pures des fiches OUVERTES à une autre entreprise du groupe (2026-11-11). Liste fermée, champ par champ : ce qu'une entreprise
 * partenaire peut MODIFIER sur une fiche qui n'est pas la sienne. Jamais le salaire, les primes, les bulletins, les fichiers RH, l'indemnité
 * d'un stagiaire, le responsable, le rôle ni le statut : ajouter une colonne à la fiche ne l'ouvre jamais par accident.
 */
export type TypeCible = "UTILISATEUR" | "STAGIAIRE";

export type ChampModifiable = {
  cle: string;
  libelle: string;
  genre: "texte" | "jour" | "contrat" | "email";
  requis?: boolean;
  max: number;
};

export const CONTRATS_PARTAGES = ["CDI", "CDD", "STAGE", "PRESTATAIRE"] as const;

export const CHAMPS_MODIFIABLES: Record<TypeCible, ChampModifiable[]> = {
  UTILISATEUR: [
    { cle: "poste", libelle: m("Poste"), genre: "texte", requis: true, max: 120 },
    { cle: "typeContrat", libelle: m("Type de contrat"), genre: "contrat", requis: true, max: 20 },
    { cle: "dateFinContrat", libelle: m("Fin de contrat"), genre: "jour", max: 10 },
    { cle: "telephone", libelle: m("Téléphone"), genre: "texte", max: 40 },
    { cle: "adresse", libelle: m("Adresse"), genre: "texte", max: 200 },
    { cle: "urgenceNom", libelle: m("Personne à prévenir"), genre: "texte", max: 120 },
    { cle: "urgenceTelephone", libelle: m("Téléphone de la personne à prévenir"), genre: "texte", max: 40 },
    { cle: "dateNaissance", libelle: m("Date de naissance"), genre: "jour", max: 10 },
  ],
  STAGIAIRE: [
    { cle: "etablissement", libelle: m("Établissement"), genre: "texte", requis: true, max: 160 },
    { cle: "filiere", libelle: m("Filière"), genre: "texte", max: 120 },
    { cle: "niveau", libelle: m("Niveau"), genre: "texte", max: 60 },
    { cle: "telephone", libelle: m("Téléphone"), genre: "texte", max: 40 },
    { cle: "email", libelle: m("Email"), genre: "email", max: 160 },
    { cle: "tuteurEcoleNom", libelle: m("Tuteur à l'école"), genre: "texte", max: 120 },
    { cle: "tuteurEcoleContact", libelle: m("Contact du tuteur"), genre: "texte", max: 120 },
    { cle: "mission", libelle: m("Mission"), genre: "texte", max: 500 },
    { cle: "dateNaissance", libelle: m("Date de naissance"), genre: "jour", max: 10 },
  ],
};

export type ValeursFiche = Record<string, string>;

/**
 * Valide les valeurs reçues : seuls les champs de la liste sont lus (tout autre est ignoré, jamais écrit), texte nettoyé et borné.
 * Un champ facultatif vide devient `null`. Renvoie les valeurs prêtes à écrire, ou une clé d'erreur française.
 */
export function validerChampsFiche(type: TypeCible, lire: (cle: string) => string | null): { ok: true; valeurs: Record<string, string | null> } | { ok: false; erreur: string } {
  const valeurs: Record<string, string | null> = {};
  for (const c of CHAMPS_MODIFIABLES[type]) {
    const brut = (lire(c.cle) ?? "").trim();
    if (!brut) {
      if (c.requis) return { ok: false, erreur: m("Un champ obligatoire est vide.") };
      valeurs[c.cle] = null;
      continue;
    }
    if (brut.length > c.max) return { ok: false, erreur: m("Un champ est trop long.") };
    if (c.genre === "jour" && !jourValide(brut)) return { ok: false, erreur: m("Une date est invalide.") };
    if (c.genre === "contrat" && !(CONTRATS_PARTAGES as readonly string[]).includes(brut)) return { ok: false, erreur: m("Type de contrat invalide.") };
    if (c.genre === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(brut)) return { ok: false, erreur: m("Adresse email invalide.") };
    valeurs[c.cle] = brut;
  }
  return { ok: true, valeurs };
}

/** Libellés des champs dont la valeur a changé (pour la trace) ; `avant` et `apres` sont comparés champ par champ, vide = null. */
export function champsChanges(type: TypeCible, avant: Record<string, string | null | undefined>, apres: Record<string, string | null>): string[] {
  return CHAMPS_MODIFIABLES[type].filter((c) => (avant[c.cle] ?? null) !== (apres[c.cle] ?? null)).map((c) => c.libelle);
}
