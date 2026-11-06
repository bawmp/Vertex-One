import { m } from "@/lib/i18n/catalogue";

/** Messages d'erreur du choix d'assignation (traduits à l'affichage par l'action qui les renvoie). */
export const MESSAGE_ASSIGNATION = {
  FORME: m("Choix d'assignation invalide."),
  PERSONNE_INVALIDE: m("Une des personnes choisies ne peut pas recevoir de prospects (inactive, sans accès au CRM ou hors de votre entreprise)."),
  INTROUVABLE: m("Clé ou page introuvable (déjà révoquée ou supprimée ?)."),
} as const;
