export type JourSemaine = "LUNDI" | "MARDI" | "MERCREDI" | "JEUDI" | "VENDREDI" | "SAMEDI" | "DIMANCHE";

export type FenetreHebdo = { jourSemaine: JourSemaine; heureDebut: string; heureFin: string };
export type ReservationExistante = { dateDebut: Date; dateFin: Date };

const JOURS_PAR_INDEX_JS: JourSemaine[] = ["DIMANCHE", "LUNDI", "MARDI", "MERCREDI", "JEUDI", "VENDREDI", "SAMEDI"];

function heureVersDate(jour: Date, heure: string): Date {
  const [h, m] = heure.split(":").map(Number);
  const d = new Date(jour);
  d.setHours(h, m, 0, 0);
  return d;
}

function seChevauchent(debutA: Date, finA: Date, debutB: Date, finB: Date): boolean {
  return debutA < finB && debutB < finA;
}

/**
 * Fonction pure (comme calculerStatutArrivee() pour les Shifts RH) —
 * `maintenant` est toujours injecté, jamais `new Date()` interne, pour
 * rester testable. Le tampon (dureeTamponMinutes) est inclus dans la fenêtre
 * de comparaison des chevauchements existants — jamais dans le test "le
 * service tient dans les horaires d'ouverture", qui ne porte que sur la
 * durée du service lui-même (un battement de nettoyage peut légitimement
 * déborder après la fermeture). Cette même fenêtre (service + tampon) doit
 * rester identique à celle utilisée pour écrire reservation.dateFin — c'est
 * elle que la contrainte EXCLUDE (voir drizzle/0075_*) compare aussi, les
 * deux ne doivent jamais se contredire sur ce qu'est "occupé".
 */
export function calculerCreneauxDisponibles(params: {
  date: Date;
  fenetres: FenetreHebdo[];
  reservationsExistantes: ReservationExistante[];
  dureeServiceMinutes: number;
  dureeTamponMinutes: number;
  delaiMinimumHeures: number;
  maintenant: Date;
}): Date[] {
  const { date, fenetres, reservationsExistantes, dureeServiceMinutes, dureeTamponMinutes, delaiMinimumHeures, maintenant } = params;

  const jourDemande = JOURS_PAR_INDEX_JS[date.getDay()];
  const seuil = new Date(maintenant.getTime() + delaiMinimumHeures * 60 * 60 * 1000);
  const pasMs = dureeServiceMinutes * 60 * 1000;
  const occupationMs = (dureeServiceMinutes + dureeTamponMinutes) * 60 * 1000;

  const creneaux: Date[] = [];
  for (const fenetre of fenetres.filter((f) => f.jourSemaine === jourDemande)) {
    const debutFenetre = heureVersDate(date, fenetre.heureDebut);
    const finFenetre = heureVersDate(date, fenetre.heureFin);

    for (let candidat = debutFenetre.getTime(); candidat + pasMs <= finFenetre.getTime(); candidat += pasMs) {
      const debutCandidat = new Date(candidat);
      if (debutCandidat < seuil) continue;

      const finOccupation = new Date(candidat + occupationMs);
      const chevauche = reservationsExistantes.some((r) => seChevauchent(debutCandidat, finOccupation, r.dateDebut, r.dateFin));
      if (!chevauche) creneaux.push(debutCandidat);
    }
  }

  return creneaux.sort((a, b) => a.getTime() - b.getTime());
}
