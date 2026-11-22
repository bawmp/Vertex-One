import { echapper } from "@/lib/notifications/equipe";
import type { ValeursMission } from "./missions-regles";

const LIBELLE_FR: Record<string, string> = { HEBDOMADAIRE: "hebdomadaire", MENSUELLE: "mensuelle", LONGUE_DUREE: "de longue durée", PERMANENTE: "permanente" };

function jourLisible(jour: string): string {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${jour}T00:00:00Z`));
}

/**
 * Email envoyé à la personne à qui l'on confie une mission. Texte pur (pas d'accès base), tout ce qui a été saisi est échappé avant d'entrer
 * dans le HTML : le titre ou le détail d'une mission ne doit jamais pouvoir injecter de balise dans la boîte de la personne.
 */
export function gabaritMissionConfiee(p: { nomPersonne: string; confieePar: string; entreprise: string; mission: ValeursMission; lien: string }): { sujet: string; html: string } {
  const v = p.mission;
  const periode = v.dateFin ? `du ${jourLisible(v.dateDebut)} au ${jourLisible(v.dateFin)}` : `à partir du ${jourLisible(v.dateDebut)}, sans date de fin`;
  const lignes = [
    `<p>Bonjour ${echapper(p.nomPersonne)},</p>`,
    `<p>${echapper(p.confieePar)} vous a confié une mission ${LIBELLE_FR[v.horizon] ?? ""} chez ${echapper(p.entreprise)} :</p>`,
    `<p><strong>${echapper(v.titre)}</strong><br>Période : ${periode}.</p>`,
    v.resultatAttendu ? `<p><strong>Résultat attendu :</strong> ${echapper(v.resultatAttendu)}</p>` : "",
    v.description ? `<p style="white-space:pre-line">${echapper(v.description)}</p>` : "",
    `<p>Vous pouvez suivre son avancement et laisser un point de suivi depuis <a href="${echapper(p.lien)}">vos missions</a>.</p>`,
  ];
  return { sujet: `Nouvelle mission ${LIBELLE_FR[v.horizon] ?? ""} : ${v.titre}`.replace(/\s+/g, " ").trim(), html: lignes.filter(Boolean).join("") };
}

/** Email envoyé UNE fois par personne quand ses missions de la semaine ou du mois viennent d'être renouvelées. Tout texte est échappé. */
export function gabaritMissionsRenouvelees(p: { nomPersonne: string; missions: { titre: string; resultatAttendu: string | null; dateDebut: string; dateFin: string }[]; lien: string }): { sujet: string; html: string } {
  const lignes = p.missions.map((x) => `<li><strong>${echapper(x.titre)}</strong> — du ${jourLisible(x.dateDebut)} au ${jourLisible(x.dateFin)}${x.resultatAttendu ? `<br>Résultat attendu : ${echapper(x.resultatAttendu)}` : ""}</li>`).join("");
  return {
    sujet: p.missions.length === 1 ? `Mission renouvelée : ${p.missions[0].titre}`.replace(/\s+/g, " ").trim() : `${p.missions.length} missions renouvelées pour la nouvelle période`,
    html: [
      `<p>Bonjour ${echapper(p.nomPersonne)},</p>`,
      `<p>${p.missions.length === 1 ? "Votre mission est renouvelée" : "Vos missions sont renouvelées"} pour la nouvelle période, avec un avancement remis à zéro :</p>`,
      `<ul>${lignes}</ul>`,
      `<p>Suivez-les et laissez vos points de suivi depuis <a href="${echapper(p.lien)}">vos missions</a>.</p>`,
    ].join(""),
  };
}
