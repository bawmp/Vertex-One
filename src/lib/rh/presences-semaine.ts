import { and, gte, inArray, lte, eq } from "drizzle-orm";
import { avecEntreprise } from "@/db/client";
import { demandeConge, pointage } from "@/db/schema";
import type { UtilisateurConnecte } from "@/lib/session";
import { chargerFiche, isoDuJour, joursDeSemaine, semaineDuMois, statutEffectif, type FichePresence, type LignePresence, type StatutPresence } from "./presences";

export type CelluleSemaine = { statut: StatutPresence | null; heureArrivee: string | null; heureDepart: string | null };
export type CumulMois = { presents: number; retards: number; absents: number; conges: number; nonRenseignes: number };
export type LigneSemaine = { dossierRHId: string; nom: string; poste: string; cellules: CelluleSemaine[]; presents: number; retards: number; absents: number; conges: number; cumul: CumulMois };
export type SectionSemaine = { entrepriseId: string; entrepriseNom: string; lignes: LigneSemaine[] };
export type FicheSemaine = { jours: string[]; mois: { debut: string; fin: string; joursEcoules: number }; gerant: { id: string; nom: string } | null; sections: SectionSemaine[]; totaux: { presents: number; retards: number; absents: number; conges: number; effectif: number } };

/** La fiche d'une semaine : sept fiches journalières (mêmes droits, mêmes entreprises jointes) regroupées par employé. null si l'accès est refusé. */
export async function chargerSemaine(utilisateurConnecte: UtilisateurConnecte, dateIso: string): Promise<FicheSemaine | null> {
  const jours = joursDeSemaine(dateIso);
  const fiches = await Promise.all(jours.map((j) => chargerFiche(utilisateurConnecte, j)));
  if (fiches.some((f) => !f)) return null;
  const sem = fiches as FichePresence[];

  const sections: SectionSemaine[] = sem[0].sections.map((s0, idx) => {
    const lignes = new Map<string, LigneSemaine>();
    sem.forEach((f, i) => {
      for (const l of f.sections[idx]?.lignes ?? ([] as LignePresence[])) {
        let ligne = lignes.get(l.dossierRHId);
        if (!ligne) {
          ligne = { dossierRHId: l.dossierRHId, nom: l.nom, poste: l.poste, cellules: jours.map(() => ({ statut: null, heureArrivee: null, heureDepart: null })), presents: 0, retards: 0, absents: 0, conges: 0, cumul: { presents: 0, retards: 0, absents: 0, conges: 0, nonRenseignes: 0 } };
          lignes.set(l.dossierRHId, ligne);
        }
        const st = statutEffectif(l);
        ligne.cellules[i] = { statut: st, heureArrivee: l.heureArrivee, heureDepart: l.heureDepart };
        if (st === "PRESENT") ligne.presents++;
        else if (st === "RETARD") ligne.retards++;
        else if (st === "ABSENT") ligne.absents++;
        else if (st === "CONGE") ligne.conges++;
      }
    });
    return { entrepriseId: s0.entrepriseId, entrepriseNom: s0.entrepriseNom, lignes: [...lignes.values()].sort((a, b) => a.nom.localeCompare(b.nom, "fr")) };
  });

  // Cumul du mois de la semaine (du 1er au dernier jour, « à ce jour » : les jours à venir ne comptent pas comme non renseignés).
  const { mois, annee } = semaineDuMois(jours[0]);
  const premier = new Date(annee, mois, 1);
  const dernier = new Date(annee, mois + 1, 0);
  const aujourdhui = new Date();
  aujourdhui.setHours(0, 0, 0, 0);
  const limite = dernier < aujourdhui ? dernier : aujourdhui;
  const joursEcoules = limite < premier ? 0 : limite.getDate();
  for (const s of sections) await cumulerMois(s, premier, dernier, joursEcoules);

  const totaux = { presents: 0, retards: 0, absents: 0, conges: 0, effectif: 0 };
  for (const s of sections)
    for (const l of s.lignes) {
      totaux.effectif++;
      totaux.presents += l.presents;
      totaux.retards += l.retards;
      totaux.absents += l.absents;
      totaux.conges += l.conges;
    }
  return { jours, mois: { debut: isoDuJour(premier), fin: isoDuJour(dernier), joursEcoules }, gerant: sem[0].gerant, sections, totaux };
}

/** Compte, pour chaque employé de la section, ses jours du mois selon les lignes de pointage et les congés approuvés (lecture dans SON entreprise). */
async function cumulerMois(section: SectionSemaine, premier: Date, dernier: Date, joursEcoules: number): Promise<void> {
  if (section.lignes.length === 0) return;
  const ids = section.lignes.map((l) => l.dossierRHId);
  const finMois = new Date(dernier);
  finMois.setHours(23, 59, 59, 999);
  const { lignes, conges } = await avecEntreprise(section.entrepriseId, async (tx) => ({
    lignes: await tx.select({ dossierRHId: pointage.dossierRHId, date: pointage.date, statut: pointage.statut }).from(pointage).where(and(eq(pointage.entrepriseId, section.entrepriseId), inArray(pointage.dossierRHId, ids), gte(pointage.date, premier), lte(pointage.date, finMois))),
    conges: await tx.select({ dossierRHId: demandeConge.dossierRHId, debut: demandeConge.dateDebut, fin: demandeConge.dateFin }).from(demandeConge).where(and(eq(demandeConge.entrepriseId, section.entrepriseId), inArray(demandeConge.dossierRHId, ids), eq(demandeConge.statut, "APPROUVEE"), lte(demandeConge.dateDebut, finMois), gte(demandeConge.dateFin, premier))),
  }));
  const parDossier = new Map(section.lignes.map((l) => [l.dossierRHId, l]));
  const saisis = new Map<string, Set<string>>(); // jours qui ont une ligne de pointage, par employé
  for (const p of lignes) {
    const l = parDossier.get(p.dossierRHId);
    if (!l) continue;
    (saisis.get(p.dossierRHId) ?? saisis.set(p.dossierRHId, new Set()).get(p.dossierRHId)!).add(isoDuJour(p.date));
    if (p.statut === "PRESENT") l.cumul.presents++;
    else if (p.statut === "RETARD") l.cumul.retards++;
    else if (p.statut === "ABSENT") l.cumul.absents++;
    else if (p.statut === "CONGE") l.cumul.conges++;
  }
  // Un congé approuvé compte pour chaque jour du mois qu'il couvre, sauf si ce jour a déjà une ligne de pointage (qui l'emporte).
  for (const c of conges) {
    const l = parDossier.get(c.dossierRHId);
    if (!l) continue;
    const jours = saisis.get(c.dossierRHId);
    const d = new Date(Math.max(premier.getTime(), new Date(c.debut).setHours(0, 0, 0, 0)));
    const fin = Math.min(dernier.getTime(), new Date(c.fin).setHours(0, 0, 0, 0));
    for (; d.getTime() <= fin; d.setDate(d.getDate() + 1)) if (!jours?.has(isoDuJour(d))) l.cumul.conges++;
  }
  for (const l of section.lignes) l.cumul.nonRenseignes = Math.max(0, joursEcoules - (l.cumul.presents + l.cumul.retards + l.cumul.absents + l.cumul.conges));
}
