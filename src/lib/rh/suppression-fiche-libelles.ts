import { m } from "@/lib/i18n/catalogue";

/** Texte pur, partagé entre le serveur (refus) et l'écran (explication) : aucun accès base ici, un composant client peut l'importer. */
export const MESSAGE_SALAIRE_DEJA_PAYE = m(
  "Un salaire a déjà été payé à cette personne : sa fiche ne peut pas être effacée. Retirez son accès depuis Paramètres → Équipe (la fiche est alors archivée, ses données sont gardées)."
);
