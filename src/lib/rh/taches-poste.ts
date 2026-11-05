import { and, asc, eq, ne } from "drizzle-orm";
import type { TransactionDrizzle } from "@/db/client";
import { tachePoste, utilisateur } from "@/db/schema";
import { m } from "@/lib/i18n/catalogue";
import { MAX_TACHES_POSTE, validerTachePoste, type FrequenceTache, type SaisieTachePoste, type TachePosteLue } from "./taches-poste-regles";
import { peut } from "@/lib/permissions";
import { idsVisibles } from "@/lib/portee";
import type { UtilisateurConnecte } from "@/lib/session";

/** Tâches du poste (accès base) : lisibles sur la fiche par la personne, son manager (portée RH) et l'Administrateur — jamais par un collègue hors de cette portée. */
/**
 * Qui peut poser ou retirer les tâches du poste d'une personne : l'Administrateur, ou le Manager qui a le droit de modifier la RH ET dont la portée
 * RH contient cette personne. Jamais la personne elle-même (ni un Manager sur sa propre fiche) : on ne se fixe pas ses propres responsabilités.
 */
export function peutGererTachesPoste(u: UtilisateurConnecte, cibleId: string, ids: "TOUT" | string[]): boolean {
  if (u.role === "ADMIN") return true;
  if (u.role !== "MANAGER" || u.utilisateurId === cibleId) return false;
  if (!peut(u, "RH", "MODIFIER")) return false;
  return ids === "TOUT" || ids.includes(cibleId);
}

export async function lireTachesPoste(tx: TransactionDrizzle, entrepriseId: string, utilisateurId: string): Promise<TachePosteLue[]> {
  const lignes = await tx
    .select({ id: tachePoste.id, titre: tachePoste.titre, description: tachePoste.description, frequence: tachePoste.frequence, creeLe: tachePoste.creeLe })
    .from(tachePoste)
    .where(and(eq(tachePoste.entrepriseId, entrepriseId), eq(tachePoste.utilisateurId, utilisateurId)))
    .orderBy(asc(tachePoste.ordre), asc(tachePoste.creeLe));
  return lignes.map((l) => ({ ...l, frequence: l.frequence as FrequenceTache }));
}

type Resultat = { ok: true } | { ok: false; erreur: string };

/** Cible relue en base (jamais l'identifiant d'une autre entreprise) : `utilisateur` est en RLS permissive, le filtre est donc explicite. */
async function cibleDeLEntreprise(tx: TransactionDrizzle, entrepriseId: string, utilisateurId: string): Promise<boolean> {
  const [c] = await tx.select({ id: utilisateur.id }).from(utilisateur).where(and(eq(utilisateur.id, utilisateurId), eq(utilisateur.entrepriseId, entrepriseId), ne(utilisateur.role, "CLIENT"), ne(utilisateur.role, "COMPTABLE")));
  return Boolean(c);
}

export async function ajouterTachePoste(tx: TransactionDrizzle, u: UtilisateurConnecte, cibleId: string, saisie: SaisieTachePoste): Promise<Resultat> {
  const v = validerTachePoste(saisie);
  if (!v.ok) return v;
  if (!(await cibleDeLEntreprise(tx, u.entrepriseId, cibleId))) return { ok: false, erreur: m("Collaborateur introuvable.") };
  const ids = u.role === "ADMIN" ? "TOUT" : await idsVisibles(tx, u, "RH");
  if (!peutGererTachesPoste(u, cibleId, ids)) return { ok: false, erreur: m("Vous n'avez pas le droit de modifier les tâches de ce poste.") };
  const existantes = await lireTachesPoste(tx, u.entrepriseId, cibleId);
  if (existantes.length >= MAX_TACHES_POSTE) return { ok: false, erreur: m("Trente tâches au plus par poste : retirez-en une avant d'en ajouter.") };
  await tx.insert(tachePoste).values({ entrepriseId: u.entrepriseId, utilisateurId: cibleId, ...v.valeurs, ordre: existantes.length, creeParId: u.utilisateurId });
  return { ok: true };
}

export async function retirerTachePoste(tx: TransactionDrizzle, u: UtilisateurConnecte, tacheId: string): Promise<Resultat> {
  const [t] = await tx.select({ utilisateurId: tachePoste.utilisateurId }).from(tachePoste).where(and(eq(tachePoste.id, tacheId), eq(tachePoste.entrepriseId, u.entrepriseId)));
  if (!t) return { ok: false, erreur: m("Tâche introuvable.") };
  const ids = u.role === "ADMIN" ? "TOUT" : await idsVisibles(tx, u, "RH");
  if (!peutGererTachesPoste(u, t.utilisateurId, ids)) return { ok: false, erreur: m("Vous n'avez pas le droit de modifier les tâches de ce poste.") };
  await tx.delete(tachePoste).where(and(eq(tachePoste.id, tacheId), eq(tachePoste.entrepriseId, u.entrepriseId)));
  return { ok: true };
}
