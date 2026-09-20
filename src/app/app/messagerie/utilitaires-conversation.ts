import type { MessageAffiche } from "@/lib/messagerie/acces";

export const heure = (iso: string) => new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Douala" }).format(new Date(iso));
export const jour = (iso: string) => new Intl.DateTimeFormat("fr-FR", { dateStyle: "full", timeZone: "Africa/Douala" }).format(new Date(iso));
export const cleJour = (iso: string) => new Intl.DateTimeFormat("fr-CA", { timeZone: "Africa/Douala" }).format(new Date(iso));

/** Fusionne des messages reçus dans la liste : un message déjà connu est remplacé (suppression, réaction), un nouveau est ajouté. */
export function fusionner(actuels: MessageAffiche[], recus: MessageAffiche[]): MessageAffiche[] {
  if (recus.length === 0) return actuels;
  const parId = new Map(actuels.map((m) => [m.id, m]));
  for (const m of recus) parId.set(m.id, m);
  return [...parId.values()].sort((a, b) => (a.creeLe < b.creeLe ? -1 : a.creeLe > b.creeLe ? 1 : a.id < b.id ? -1 : 1));
}

export function plusRecentChangement(messages: MessageAffiche[]): string | null {
  return messages.reduce<string | null>((max, m) => (max === null || m.misAJourLe > max ? m.misAJourLe : max), null);
}

/**
 * Délai avant la prochaine lecture d'une conversation : 3 s tant que ça bouge, puis de plus en plus espacé quand rien ne
 * change (jusqu'à 10 s après une minute de calme), et très espacé si l'onglet est masqué. Chaque lecture coûte
 * plusieurs requêtes : inutile d'interroger à 3 s une conversation endormie. Revient à 3 s dès qu'il y a de l'activité.
 */
export function delaiProchaineLecture(visible: boolean, lecturesVidesConsecutives: number): number {
  if (!visible) return 20_000;
  return Math.min(3_000 * (1 + Math.floor(lecturesVidesConsecutives / 5)), 10_000);
}

export type PersonneMentionnable = { id: string; nom: string };
