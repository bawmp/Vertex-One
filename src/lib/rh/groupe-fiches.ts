import { and, eq, ne } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { dossierRH, entreprise, service, utilisateur } from "@/db/schema";
import { peut } from "@/lib/permissions";
import type { UtilisateurConnecte } from "@/lib/session";
import { peutVoirPhotoOuverte } from "@/lib/rh/fiches-ouvertes";
import { anniversairesProches, type AnniversaireProche } from "./anniversaires-regles";

/**
 * Partage des fiches collaborateur entre les entreprises d'un groupe (2026-11-04). Exception VOLONTAIRE à l'isolation entre filiales, au même
 * titre que le recrutement partagé : elle n'agit que si LES DEUX entreprises l'ont activée (réglage de l'Administrateur) et qu'elles sont dans le
 * même groupe. La RLS reste strictement par entreprise : la lecture rouvre une transaction DANS l'entreprise propriétaire (`avecEntreprise`),
 * avec un identifiant que CE module a lui-même déduit de la base, jamais un identifiant venu du navigateur.
 *
 * **Liste blanche, en lecture seule** : nom, photo, rôle, poste, type de contrat, date d'arrivée, département, téléphone et date de naissance
 * (pour les anniversaires). **Jamais** le salaire — pas même pour l'Administrateur d'une autre entreprise —, ni l'adresse, la personne à
 * prévenir, les fichiers RH, les congés, les évaluations ou les tâches. Les champs sont nommés un par un dans la requête : ajouter une colonne à la
 * fiche ne la partage jamais par accident.
 */
export type PartenaireFiches = { id: string; nom: string };

/** Entreprises avec lesquelles `entrepriseId` partage ses fiches : même groupe, réglage actif des deux côtés. `entreprise` n'a pas de RLS. */
export async function partenairesFiches(entrepriseId: string): Promise<PartenaireFiches[]> {
  const [moi] = await db.select({ groupeId: entreprise.groupeId, partage: entreprise.fichesPartageesGroupe }).from(entreprise).where(eq(entreprise.id, entrepriseId));
  if (!moi?.groupeId || !moi.partage) return [];
  return db
    .select({ id: entreprise.id, nom: entreprise.nom })
    .from(entreprise)
    .where(and(eq(entreprise.groupeId, moi.groupeId), ne(entreprise.id, entrepriseId), eq(entreprise.fichesPartageesGroupe, true)))
    .orderBy(entreprise.nom);
}

export type EtatPartageFiches = { groupe: boolean; partageActif: boolean; autres: { id: string; nom: string; partageActif: boolean }[] };

/** Pour l'écran de l'Administrateur : l'entreprise est-elle dans un groupe, son réglage, et celui des autres entreprises du groupe. */
export async function etatPartageFiches(entrepriseId: string): Promise<EtatPartageFiches> {
  const [moi] = await db.select({ groupeId: entreprise.groupeId, partage: entreprise.fichesPartageesGroupe }).from(entreprise).where(eq(entreprise.id, entrepriseId));
  if (!moi?.groupeId) return { groupe: false, partageActif: moi?.partage ?? false, autres: [] };
  const autres = await db.select({ id: entreprise.id, nom: entreprise.nom, partage: entreprise.fichesPartageesGroupe }).from(entreprise).where(and(eq(entreprise.groupeId, moi.groupeId), ne(entreprise.id, entrepriseId))).orderBy(entreprise.nom);
  return { groupe: true, partageActif: moi.partage, autres: autres.map((a) => ({ id: a.id, nom: a.nom, partageActif: a.partage })) };
}

export async function definirPartageFiches(entrepriseId: string, actif: boolean): Promise<void> {
  await db.update(entreprise).set({ fichesPartageesGroupe: actif }).where(eq(entreprise.id, entrepriseId));
}

/** L'Administrateur et les Managers qui ont accès au module RH voient les fiches partagées (lecture seule) ; un Employé jamais. */
export function peutVoirFichesPartagees(u: UtilisateurConnecte): boolean {
  return (u.role === "ADMIN" || u.role === "MANAGER") && peut(u, "RH", "VOIR");
}

export type CollaborateurPartage = {
  entrepriseId: string;
  entrepriseNom: string;
  utilisateurId: string;
  nom: string;
  role: string;
  poste: string;
  typeContrat: string;
  dateEmbauche: Date;
  departement: string | null;
  telephone: string | null;
  dateNaissance: string | null;
  /** Clé de stockage de la photo : sert à savoir s'il y en a une, jamais exposée au navigateur (la photo passe par la route contrôlée). */
  photoCle: string | null;
};

/** Collaborateurs actifs des entreprises partenaires, champs de la liste blanche uniquement. */
export async function collaborateursDesPartenaires(u: UtilisateurConnecte): Promise<CollaborateurPartage[]> {
  if (!peutVoirFichesPartagees(u)) return [];
  const partenaires = await partenairesFiches(u.entrepriseId);
  const resultat: CollaborateurPartage[] = [];
  for (const p of partenaires) {
    const lignes = await avecEntreprise(p.id, (tx) =>
      tx
        .select({
          utilisateurId: utilisateur.id,
          nom: utilisateur.nomComplet,
          role: utilisateur.role,
          photoCle: utilisateur.photoCleStockage,
          poste: dossierRH.poste,
          typeContrat: dossierRH.typeContrat,
          dateEmbauche: dossierRH.dateEmbauche,
          dateNaissance: dossierRH.dateNaissance,
          telephone: dossierRH.telephone,
          departement: service.nom,
        })
        .from(dossierRH)
        .innerJoin(utilisateur, eq(dossierRH.utilisateurId, utilisateur.id))
        .leftJoin(service, eq(utilisateur.serviceId, service.id))
        .where(and(eq(dossierRH.entrepriseId, p.id), eq(utilisateur.entrepriseId, p.id), eq(utilisateur.statut, "ACTIF")))
        .orderBy(utilisateur.nomComplet)
    );
    for (const l of lignes) resultat.push({ ...l, entrepriseId: p.id, entrepriseNom: p.nom });
  }
  return resultat;
}

export type AnniversairePartage = AnniversaireProche & { entrepriseNom: string };

/** Anniversaires des collaborateurs des entreprises partenaires, pour la carte « Anniversaires à venir » (jamais d'email vers une autre entreprise). */
export async function anniversairesDesPartenaires(u: UtilisateurConnecte, aujourdhui: string, fenetre = 30): Promise<AnniversairePartage[]> {
  const gens = (await collaborateursDesPartenaires(u)).filter((c) => c.dateNaissance);
  const noms = new Map(gens.map((c) => [c.utilisateurId, c.entrepriseNom]));
  return anniversairesProches(gens.map((c) => ({ type: "UTILISATEUR" as const, id: c.utilisateurId, nom: c.nom, naissance: c.dateNaissance! })), aujourdhui, fenetre).map((a) => ({ ...a, entrepriseNom: noms.get(a.id) ?? "" }));
}

/** Peut-on afficher la photo de cette personne, qui travaille dans une autre entreprise ? Oui seulement si elle est dans une entreprise partenaire (partage actif des deux côtés). */
export async function peutVoirPhotoPartenaire(u: UtilisateurConnecte, personneId: string): Promise<boolean> {
  if (await peutVoirPhotoOuverte(u, personneId)) return true; // fiche ouverte par son entreprise (2026-11-11)
  if (!peutVoirFichesPartagees(u)) return false;
  const [p] = await db.select({ entrepriseId: utilisateur.entrepriseId, statut: utilisateur.statut }).from(utilisateur).where(eq(utilisateur.id, personneId));
  if (!p || p.entrepriseId === u.entrepriseId || p.statut !== "ACTIF") return false;
  return (await partenairesFiches(u.entrepriseId)).some((x) => x.id === p.entrepriseId);
}
