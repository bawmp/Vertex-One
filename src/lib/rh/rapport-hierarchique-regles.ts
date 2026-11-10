/**
 * Qui peut écrire à qui (rapports écrits à la hiérarchie, 2026-11-10). Règles pures : la liste réelle des personnes vient de la base,
 * relue côté serveur à chaque envoi ; rien ici ne dépend d'une valeur envoyée par le navigateur.
 *
 * - Un Employé écrit à l'un des Managers actifs de l'entreprise.
 * - Un Manager écrit à son supérieur : son responsable direct et ceux au-dessus de lui (la chaîne `managerId`), et à tout Administrateur actif.
 *   (« Celui qui lui a donné le rôle » n'est pas conservé en base : c'est le responsable indiqué à l'invitation, ou l'Administrateur.)
 * - Un Administrateur n'a personne au-dessus de lui ; les autres rôles (client, comptable) n'écrivent pas de rapport.
 */

export type PersonneRapport = {
  id: string;
  nomComplet: string;
  role: string;
  statut: string;
  managerId: string | null;
};

const PROFONDEUR_MAX = 15; // même garde-fou que la portée « équipe » : une chaîne corrompue ne boucle jamais

export function destinatairesAutorises(auteur: { id: string; role: string }, personnes: PersonneRapport[]): PersonneRapport[] {
  const actives = personnes.filter((p) => p.statut === "ACTIF" && p.id !== auteur.id);

  if (auteur.role === "EMPLOYE") return actives.filter((p) => p.role === "MANAGER");

  if (auteur.role === "MANAGER") {
    const parId = new Map(personnes.map((p) => [p.id, p]));
    const retenus = new Map<string, PersonneRapport>();
    let courant = parId.get(auteur.id)?.managerId ?? null;
    for (let niveau = 0; niveau < PROFONDEUR_MAX && courant && !retenus.has(courant) && courant !== auteur.id; niveau++) {
      const p = parId.get(courant);
      if (!p) break;
      if (p.statut === "ACTIF" && (p.role === "MANAGER" || p.role === "ADMIN")) retenus.set(p.id, p);
      courant = p.managerId;
    }
    for (const p of actives) if (p.role === "ADMIN") retenus.set(p.id, p);
    return [...retenus.values()];
  }

  return [];
}

/** Destinataire proposé d'office : le responsable direct de l'auteur s'il peut recevoir le rapport, sinon le premier de la liste. */
export function destinataireParDefaut(auteurManagerId: string | null, autorises: PersonneRapport[]): string | null {
  if (auteurManagerId && autorises.some((p) => p.id === auteurManagerId)) return auteurManagerId;
  return autorises[0]?.id ?? null;
}

export const LONGUEUR_MAX_OBJET = 150;
export const LONGUEUR_MAX_CONTENU = 10_000;

/** Un rapport est lisible par son auteur et son destinataire, jamais par un tiers (l'Administrateur compris). */
export function peutLireRapport(utilisateurId: string, rapport: { auteurId: string; destinataireId: string }): boolean {
  return utilisateurId === rapport.auteurId || utilisateurId === rapport.destinataireId;
}
