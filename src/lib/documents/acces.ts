import type { RoleSysteme } from "@/lib/permissions";

/**
 * Palier 3, section 9 — un document classé PIECE_IDENTITE ou DONNEES_SANTE
 * reste restreint au responsable du Dossier et à l'Administrateur, quel que
 * soit l'accès normal au Dossier/Projet qui le contient. Un Employé qui voit
 * par ailleurs très bien le Dossier de Jean (parce qu'un Projet en cours lui
 * est assigné) ne voit pas nécessairement son passeport.
 *
 * Documents privés d'un client (2026-10-08) : une pièce déposée depuis la fiche One CRM d'un contact, sans Dossier,
 * a pour « responsable » le responsable du contact (`contact.assigneAId`), jamais un Dossier qui n'existe pas.
 */
export function peutVoirDocumentSensible(
  utilisateur: { role: RoleSysteme; utilisateurId: string },
  categorie: string,
  dossierResponsableId: string | null
): boolean {
  if (categorie === "GENERAL") return true;
  return utilisateur.role === "ADMIN" || utilisateur.utilisateurId === dossierResponsableId;
}

/**
 * AUTRE_SENSIBLE est restreint par peutVoirDocumentSensible() depuis le Palier 3 (tout sauf GENERAL) : les filtres
 * d'affichage doivent donc le traiter comme sensible eux aussi, sinon la page le montrait à tout le monde alors que
 * son téléchargement était refusé.
 */
export function estCategorieSensible(categorie: string): boolean {
  return categorie === "PIECE_IDENTITE" || categorie === "DONNEES_SANTE" || categorie === "AUTRE_SENSIBLE";
}

/**
 * Document privé d'un client : sensible, rattaché à un contact mais à aucun Dossier ni Projet. Il vit uniquement
 * dans One CRM (fiche du contact) — jamais dans la liste du module Documents ni dans One Books.
 */
export function estDocumentPriveContact(d: { dossierId: string | null; projetId: string | null; contactId: string | null; categorie: string }): boolean {
  return !d.dossierId && !d.projetId && !!d.contactId && estCategorieSensible(d.categorie);
}

/** Responsable à comparer pour un document : celui du Dossier si le document en a un, sinon celui du contact. */
export function responsableDuDocument(r: { responsableDossierId: string | null; responsableContactId: string | null }): string | null {
  return r.responsableDossierId ?? r.responsableContactId;
}

/**
 * Suppression d'un document téléversé : quiconque a le droit de suppression générale (l'Administrateur) ou la
 * personne qui l'a ajouté elle-même (pour retirer un envoi fait par erreur). La restriction de sensibilité
 * s'applique en plus (peutVoirDocumentSensible) : on ne supprime pas ce qu'on n'a pas le droit de voir.
 */
export function peutSupprimerDocument(utilisateurId: string, televerseParId: string, droitSuppressionGenerale: boolean): boolean {
  return droitSuppressionGenerale || televerseParId === utilisateurId;
}
