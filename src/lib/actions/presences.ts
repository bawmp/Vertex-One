"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { avecEntreprise } from "@/db/client";
import { entreprise } from "@/db/schema";
import { recupererUtilisateurConnecte, type UtilisateurConnecte } from "@/lib/session";
import { disponible } from "@/lib/plans";
import { definirGerantPresences, definirPartagePresences, enregistrerPresence, joindrePartenairePresence, marquerTousPresents, rouvrirFiche, validerFiche, type SaisiePresence } from "@/lib/rh/presences";

const CHEMIN = "/app/rh/presences";

type Retour = { erreur?: string };

/** Connecté, et module RH disponible (forfait) : les droits fins (Administrateur, gérant) sont revérifiés par la logique elle-même. */
async function garde(): Promise<{ utilisateurConnecte: UtilisateurConnecte } | { erreur: string }> {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  const [e] = await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) => tx.select({ planAbonnement: entreprise.planAbonnement, statutAbonnement: entreprise.statutAbonnement }).from(entreprise).where(eq(entreprise.id, utilisateurConnecte.entrepriseId)));
  if (!e || !disponible(e, "RH")) return { erreur: "Les Ressources Humaines sont disponibles à partir du forfait Business." };
  return { utilisateurConnecte };
}

async function gardeAdmin(): Promise<{ utilisateurConnecte: UtilisateurConnecte } | { erreur: string }> {
  const g = await garde();
  if ("erreur" in g) return g;
  if (g.utilisateurConnecte.role !== "ADMIN") return { erreur: "Seul l'Administrateur peut modifier ce réglage." };
  return g;
}

/** Une ligne de la fiche (statut, heures, remarque). Toutes les valeurs sont revalidées côté serveur ; l'entreprise visée n'est retenue que si elle est la sienne ou jointe. */
export async function enregistrerPresenceAction(saisie: SaisiePresence): Promise<Retour> {
  const g = await garde();
  if ("erreur" in g) return g;
  const r = await enregistrerPresence(g.utilisateurConnecte, {
    entrepriseId: String(saisie.entrepriseId),
    dossierRHId: String(saisie.dossierRHId),
    date: String(saisie.date),
    statut: saisie.statut,
    heureArrivee: saisie.heureArrivee ? String(saisie.heureArrivee) : null,
    heureDepart: saisie.heureDepart ? String(saisie.heureDepart) : null,
    remarque: saisie.remarque ? String(saisie.remarque) : null,
  });
  if (!r.erreur) revalidatePath(CHEMIN);
  return r;
}

export async function marquerTousPresentsAction(date: string): Promise<Retour & { nombre?: number }> {
  const g = await garde();
  if ("erreur" in g) return g;
  const r = await marquerTousPresents(g.utilisateurConnecte, String(date));
  if (!r.erreur) revalidatePath(CHEMIN);
  return r;
}

export async function validerFicheAction(date: string): Promise<Retour> {
  const g = await garde();
  if ("erreur" in g) return g;
  const r = await validerFiche(g.utilisateurConnecte, String(date));
  if (!r.erreur) revalidatePath(CHEMIN);
  return r;
}

export async function rouvrirFicheAction(date: string): Promise<Retour> {
  const g = await garde();
  if ("erreur" in g) return g;
  const r = await rouvrirFiche(g.utilisateurConnecte, String(date));
  if (!r.erreur) revalidatePath(CHEMIN);
  return r;
}

/** L'Administrateur change le gérant de la fiche (`null` = aucun). */
export async function definirGerantAction(gerantId: string | null): Promise<Retour> {
  const g = await gardeAdmin();
  if ("erreur" in g) return g;
  const r = await definirGerantPresences(g.utilisateurConnecte.entrepriseId, gerantId ? String(gerantId) : null);
  if (!r.erreur) revalidatePath(CHEMIN);
  return r;
}

export async function definirPartageAction(actif: boolean): Promise<Retour> {
  const g = await gardeAdmin();
  if ("erreur" in g) return g;
  await definirPartagePresences(g.utilisateurConnecte.entrepriseId, actif === true);
  revalidatePath(CHEMIN);
  return {};
}

export async function joindrePartenaireAction(partenaireId: string, joindre: boolean): Promise<Retour> {
  const g = await gardeAdmin();
  if ("erreur" in g) return g;
  const r = await joindrePartenairePresence(g.utilisateurConnecte.entrepriseId, g.utilisateurConnecte.utilisateurId, String(partenaireId), joindre === true);
  if (!r.erreur) revalidatePath(CHEMIN);
  return r;
}
