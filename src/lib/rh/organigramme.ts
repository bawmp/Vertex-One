import { and, eq, inArray, ne } from "drizzle-orm";
import type { TransactionDrizzle } from "@/db/client";
import { dossierRH, service, utilisateur } from "@/db/schema";
import { idsVisibles } from "@/lib/portee";
import type { UtilisateurConnecte } from "@/lib/session";

/** Une personne de l'organigramme : seulement ce qui sert à la situer (jamais le salaire ni les informations personnelles). */
export type PersonneOrganigramme = { id: string; dossierId: string; nom: string; role: string; poste: string; departement: string | null; managerId: string | null; photoCle: string | null };
export type NoeudOrganigramme = PersonneOrganigramme & { enfants: NoeudOrganigramme[] };

/**
 * Règle pure : construit la forêt hiérarchique à partir de la liste des personnes et de leur responsable direct. Une personne dont le responsable
 * n'est pas dans la liste (ou qui n'en a pas) est une racine ; un cycle (A responsable de B, B responsable de A) ne boucle jamais : les personnes
 * prises dans un cycle sont rattachées comme racines. Triée par nom à chaque niveau.
 */
export function construireOrganigramme(personnes: PersonneOrganigramme[]): NoeudOrganigramme[] {
  const parId = new Map(personnes.map((p) => [p.id, { ...p, enfants: [] as NoeudOrganigramme[] }]));
  // Détecte les cycles : une personne est dans un cycle si, en remontant ses responsables, on revient sur elle-même (celles qui ne font que
  // dépendre d'un cycle restent rattachées normalement).
  const dansUnCycle = new Set<string>();
  for (const p of personnes) {
    const vus = new Set<string>([p.id]);
    let courant = p.managerId;
    while (courant && parId.has(courant)) {
      if (courant === p.id) {
        dansUnCycle.add(p.id);
        break;
      }
      if (vus.has(courant)) break;
      vus.add(courant);
      courant = parId.get(courant)!.managerId;
    }
  }
  const racines: NoeudOrganigramme[] = [];
  for (const noeud of parId.values()) {
    const parent = noeud.managerId && !dansUnCycle.has(noeud.id) ? parId.get(noeud.managerId) : undefined;
    if (parent) parent.enfants.push(noeud);
    else racines.push(noeud);
  }
  const trier = (liste: NoeudOrganigramme[]) => {
    liste.sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
    for (const n of liste) trier(n.enfants);
  };
  trier(racines);
  return racines;
}

/** Nombre total de personnes d'une forêt. */
export const compterPersonnes = (forets: NoeudOrganigramme[]): number => forets.reduce((s, n) => s + 1 + compterPersonnes(n.enfants), 0);

/**
 * Personnes visibles de l'utilisateur : l'Administrateur voit toute l'entreprise, un Manager son équipe (portée RH). Collaborateurs actifs
 * seulement ; un Employé n'a pas d'organigramme. Les champs sont nommés un par un : le salaire n'est jamais lu.
 */
export async function lireOrganigramme(tx: TransactionDrizzle, u: UtilisateurConnecte): Promise<NoeudOrganigramme[]> {
  if (u.role !== "ADMIN" && u.role !== "MANAGER") return [];
  const ids = await idsVisibles(tx, u, "RH");
  const lignes = await tx
    .select({ id: utilisateur.id, dossierId: dossierRH.id, nom: utilisateur.nomComplet, role: utilisateur.role, poste: dossierRH.poste, departement: service.nom, managerId: utilisateur.managerId, photoCle: utilisateur.photoCleStockage })
    .from(dossierRH)
    .innerJoin(utilisateur, eq(dossierRH.utilisateurId, utilisateur.id))
    .leftJoin(service, eq(utilisateur.serviceId, service.id))
    .where(and(eq(dossierRH.entrepriseId, u.entrepriseId), eq(utilisateur.entrepriseId, u.entrepriseId), ne(utilisateur.statut, "SUPPRIME"), eq(utilisateur.statut, "ACTIF"), ids === "TOUT" ? undefined : inArray(dossierRH.utilisateurId, ids)));
  return construireOrganigramme(lignes);
}
