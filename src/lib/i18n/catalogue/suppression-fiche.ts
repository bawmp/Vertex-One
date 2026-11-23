/** Suppression définitive d'une fiche de collaborateur par l'Administrateur (2026-11-23). */
export const SUPPRESSION_FICHE: Record<string, string> = {
  "Zone sensible": "Sensitive area",
  "Supprimer la fiche": "Delete the record",
  "Supprimer définitivement": "Delete permanently",
  "Efface définitivement la fiche de {nom} : informations personnelles, salaire, primes, congés, présences, évaluations, documents RH, tâches du poste et missions. Son accès est retiré. Ses tâches, documents et messages passés restent attribués à son nom. Cette action est irréversible.":
    "Permanently deletes {nom}'s record: personal information, salary, bonuses, leave, attendance, evaluations, HR documents, job tasks and missions. Their access is removed. Their past tasks, documents and messages stay attributed to their name. This action cannot be undone.",
  "Pour confirmer, tapez son nom complet : {nom}": "To confirm, type their full name: {nom}",
  "Seul l'Administrateur peut supprimer une fiche.": "Only the Administrator can delete a record.",
  "Vous ne pouvez pas supprimer votre propre fiche.": "You cannot delete your own record.",
  "Seule la fiche d'un Manager ou d'un Employé peut être supprimée ici.": "Only a Manager's or an Employee's record can be deleted here.",
  "Un salaire a déjà été payé à cette personne : sa fiche ne peut pas être effacée. Retirez son accès depuis Paramètres → Équipe (la fiche est alors archivée, ses données sont gardées).":
    "A salary has already been paid to this person: their record cannot be deleted. Remove their access from Settings → Team (the record is then archived and its data kept).",
  "Ce stagiaire a été embauché : il est maintenant un collaborateur. Supprimez sa fiche depuis sa fiche RH (Ressources humaines).":
    "This intern was hired: they are now a team member. Delete their record from their HR record (Human Resources).",
};
