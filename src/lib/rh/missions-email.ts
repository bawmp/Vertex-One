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
