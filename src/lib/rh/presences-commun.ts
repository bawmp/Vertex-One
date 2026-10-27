/**
 * Types et fonctions PURES de la fiche de présence, partagés entre le serveur et l'écran du gérant (aucun accès base de données ici : ce fichier est
 * importé par un composant navigateur).
 */
export type StatutPresence = "PRESENT" | "RETARD" | "ABSENT" | "CONGE";
export const STATUTS_PRESENCE: readonly StatutPresence[] = ["PRESENT", "RETARD", "ABSENT", "CONGE"];
export const JOURS_MODIFIABLES_GERANT = 31; // l'Administrateur n'a pas de limite

export type DroitFiche = "ADMIN" | "GERANT";

export type LignePresence = {
  dossierRHId: string;
  utilisateurId: string;
  nom: string;
  poste: string;
  service: string | null;
  statut: StatutPresence | null; // null = pas encore renseigné
  heureArrivee: string | null; // « HH:mm »
  heureDepart: string | null;
  remarque: string | null;
  enCongeApprouve: boolean; // un congé approuvé couvre ce jour (affiché même sans ligne de pointage)
  shiftDebut: string | null; // « HH:mm », pour suggérer un retard
  shiftTolerance: number;
  saisiPar: string | null;
};

export type SectionPresence = { entrepriseId: string; entrepriseNom: string; propre: boolean; lignes: LignePresence[] };
export type TotauxPresence = { presents: number; retards: number; absents: number; conges: number; nonRenseignes: number; total: number };

export type FichePresence = {
  date: string; // aaaa-mm-jj
  droit: DroitFiche;
  gerant: { id: string; nom: string } | null;
  validee: { parNom: string; le: Date } | null;
  sections: SectionPresence[];
  totaux: TotauxPresence;
  modifiable: boolean; // ni validée (sauf Administrateur), ni hors fenêtre de modification, ni dans le futur
};


export function isoDuJour(date: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

/** Une arrivée après l'heure du shift (tolérance comprise) est un retard : sert à suggérer « Retard » au gérant. Heures « HH:MM ». */
export function estEnRetard(shiftDebut: string | null, toleranceMinutes: number, arrivee: string): boolean {
  if (!shiftDebut || !/^\d{2}:\d{2}$/.test(arrivee)) return false;
  const [h, m] = shiftDebut.split(":").map(Number);
  const [ah, am] = arrivee.split(":").map(Number);
  return ah * 60 + am > h * 60 + m + toleranceMinutes;
}

/** Statut effectif d'une ligne : celui saisi, sinon « Congé » si un congé approuvé couvre le jour, sinon non renseigné. */
export function statutEffectif(l: Pick<LignePresence, "statut" | "enCongeApprouve">): StatutPresence | null {
  return l.statut ?? (l.enCongeApprouve ? "CONGE" : null);
}

export function totauxDe(sections: SectionPresence[]): TotauxPresence {
  const t: TotauxPresence = { presents: 0, retards: 0, absents: 0, conges: 0, nonRenseignes: 0, total: 0 };
  for (const s of sections)
    for (const l of s.lignes) {
      t.total++;
      const st = statutEffectif(l);
      if (st === "PRESENT") t.presents++;
      else if (st === "RETARD") t.retards++;
      else if (st === "ABSENT") t.absents++;
      else if (st === "CONGE") t.conges++;
      else t.nonRenseignes++;
    }
  return t;
}

