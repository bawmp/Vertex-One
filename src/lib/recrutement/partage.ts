import { and, desc, eq, ne } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { candidature, entreprise, posteOuvert } from "@/db/schema";
import { peut } from "@/lib/permissions";
import type { UtilisateurConnecte } from "@/lib/session";

/**
 * Partage du recrutement entre les entreprises d'un groupe (2026-10-26). Exception VOLONTAIRE à l'isolation entre filiales, limitée aux postes
 * et aux candidatures, et seulement quand LES DEUX entreprises l'ont activée (Recrutement → Paramètres).
 *
 * Aucune politique RLS n'est élargie : la base reste strictement cloisonnée par entreprise. Le partage rouvre une transaction DANS l'entreprise
 * propriétaire (avecEntreprise(partenaire.id, …)) — mais seulement avec un identifiant d'entreprise que CE module a lui-même déduit de la base
 * (même groupe, réglage actif des deux côtés), jamais un identifiant venu du navigateur.
 *
 * Ce que peut faire une entreprise sur le recrutement d'une autre : voir postes et candidatures, télécharger les CV, changer le statut d'une
 * candidature (le candidat est prévenu au nom de l'entreprise qui a publié le poste) et corriger ses coordonnées. Jamais la supprimer, la
 * convertir en employé, l'assigner, ni modifier les postes : cela reste à l'entreprise propriétaire.
 */
export type Partenaire = { id: string; nom: string };

/** Entreprises avec lesquelles `entrepriseId` partage son recrutement : même groupe, réglage actif des deux côtés. `entreprise` n'a pas de RLS. */
export async function partenairesRecrutement(entrepriseId: string): Promise<Partenaire[]> {
  const [moi] = await db.select({ groupeId: entreprise.groupeId, partage: entreprise.recrutementPartageGroupe }).from(entreprise).where(eq(entreprise.id, entrepriseId));
  if (!moi?.groupeId || !moi.partage) return [];
  return db
    .select({ id: entreprise.id, nom: entreprise.nom })
    .from(entreprise)
    .where(and(eq(entreprise.groupeId, moi.groupeId), ne(entreprise.id, entrepriseId), eq(entreprise.recrutementPartageGroupe, true)))
    .orderBy(entreprise.nom);
}

/** Seuls l'Administrateur et les Managers qui ont accès au module voient et gèrent le recrutement d'une autre entreprise du groupe. */
export function peutVoirRecrutementPartage(utilisateurConnecte: UtilisateurConnecte): boolean {
  return (utilisateurConnecte.role === "ADMIN" || utilisateurConnecte.role === "MANAGER") && peut(utilisateurConnecte, "RECRUTEMENT", "VOIR");
}

export function peutGererRecrutementPartage(utilisateurConnecte: UtilisateurConnecte): boolean {
  return (utilisateurConnecte.role === "ADMIN" || utilisateurConnecte.role === "MANAGER") && peut(utilisateurConnecte, "RECRUTEMENT", "MODIFIER");
}

export type CandidaturePartagee = {
  id: string;
  nom: string;
  telephone: string;
  email: string | null;
  message: string | null;
  invitationId: string | null;
  statut: string;
  assigneAId: string | null;
  posteTitre: string;
  creeLe: Date;
  entrepriseId: string;
  entrepriseNom: string;
};

/** Candidatures des entreprises partenaires (toutes, sans filtre d'assignation : c'est de la gestion partagée). */
export async function candidaturesDesPartenaires(utilisateurConnecte: UtilisateurConnecte): Promise<CandidaturePartagee[]> {
  if (!peutVoirRecrutementPartage(utilisateurConnecte)) return [];
  const partenaires = await partenairesRecrutement(utilisateurConnecte.entrepriseId);
  const resultats: CandidaturePartagee[] = [];
  for (const p of partenaires) {
    const lignes = await avecEntreprise(p.id, (tx) =>
      tx
        .select({
          id: candidature.id,
          nom: candidature.nom,
          telephone: candidature.telephone,
          email: candidature.email,
          message: candidature.message,
          invitationId: candidature.invitationId,
          statut: candidature.statut,
          assigneAId: candidature.assigneAId,
          posteTitre: posteOuvert.titre,
          creeLe: candidature.creeLe,
        })
        .from(candidature)
        .innerJoin(posteOuvert, eq(candidature.posteId, posteOuvert.id))
        .where(eq(candidature.entrepriseId, p.id))
        .orderBy(desc(candidature.creeLe))
    );
    for (const l of lignes) resultats.push({ ...l, entrepriseId: p.id, entrepriseNom: p.nom });
  }
  return resultats;
}

export type PostePartage = { id: string; titre: string; lieu: string | null; typeContrat: string | null; actif: boolean; entrepriseNom: string };

/** Postes ouverts des entreprises partenaires, en lecture seule. */
export async function postesDesPartenaires(utilisateurConnecte: UtilisateurConnecte): Promise<PostePartage[]> {
  if (!peutVoirRecrutementPartage(utilisateurConnecte)) return [];
  const partenaires = await partenairesRecrutement(utilisateurConnecte.entrepriseId);
  const resultats: PostePartage[] = [];
  for (const p of partenaires) {
    const lignes = await avecEntreprise(p.id, (tx) =>
      tx.select({ id: posteOuvert.id, titre: posteOuvert.titre, lieu: posteOuvert.lieu, typeContrat: posteOuvert.typeContrat, actif: posteOuvert.actif }).from(posteOuvert).where(eq(posteOuvert.entrepriseId, p.id)).orderBy(posteOuvert.titre)
    );
    for (const l of lignes) resultats.push({ ...l, entrepriseNom: p.nom });
  }
  return resultats;
}

export type CibleCandidature = { entrepriseId: string; partagee: boolean };

/**
 * À quelle entreprise appartient cette candidature, du point de vue de l'utilisateur connecté ? Sa propre entreprise d'abord (`partagee: false`,
 * l'appelant applique alors la portée habituelle) ; sinon une entreprise partenaire (`partagee: true`, réservé à l'Administrateur et aux Managers
 * qui peuvent gérer le recrutement). null = introuvable : jamais de confirmation qu'une candidature existe ailleurs.
 */
export async function resoudreProprietaireCandidature(utilisateurConnecte: UtilisateurConnecte, candidatureId: string): Promise<CibleCandidature | null> {
  const moi = utilisateurConnecte.entrepriseId;
  const [propre] = await avecEntreprise(moi, (tx) => tx.select({ id: candidature.id }).from(candidature).where(and(eq(candidature.id, candidatureId), eq(candidature.entrepriseId, moi))));
  if (propre) return { entrepriseId: moi, partagee: false };

  if (!peutGererRecrutementPartage(utilisateurConnecte)) return null;
  for (const p of await partenairesRecrutement(moi)) {
    const [trouvee] = await avecEntreprise(p.id, (tx) => tx.select({ id: candidature.id }).from(candidature).where(and(eq(candidature.id, candidatureId), eq(candidature.entrepriseId, p.id))));
    if (trouvee) return { entrepriseId: p.id, partagee: true };
  }
  return null;
}
