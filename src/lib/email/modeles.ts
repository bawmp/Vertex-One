import { eq, and } from "drizzle-orm";
import type { TransactionDrizzle } from "@/db/client";
import { modeleEmail, typeModeleEmail } from "@/db/schema";

export type TypeModeleEmail = (typeof typeModeleEmail.enumValues)[number];

export const VARIABLES_DISPONIBLES = [
  { cle: "client", description: "Nom du client" },
  { cle: "numero", description: "Numéro du document (ex : DEV-2026-000042)" },
  { cle: "montant", description: "Montant TTC formaté (ex : 150 000 FCFA)" },
  { cle: "entreprise", description: "Nom de l'entreprise émettrice" },
] as const;

/** Variables des modèles envoyés aux candidats (One Recruit). */
export const VARIABLES_CANDIDATURE = [
  { cle: "candidat", description: "Nom du candidat" },
  { cle: "poste", description: "Intitulé du poste visé" },
  { cle: "entreprise", description: "Nom de l'entreprise" },
] as const;

/** Un modèle par statut de candidature qui déclenche un email (« Reçue » n'en déclenche aucun). */
export const TYPES_MODELE_CANDIDATURE = ["CANDIDATURE_EN_EXAMEN", "CANDIDATURE_ENTRETIEN", "CANDIDATURE_OFFRE", "CANDIDATURE_EMBAUCHE", "CANDIDATURE_REJETEE"] as const satisfies readonly TypeModeleEmail[];

export function estModeleCandidature(type: TypeModeleEmail): boolean {
  return (TYPES_MODELE_CANDIDATURE as readonly string[]).includes(type);
}

export function variablesDuType(type: TypeModeleEmail) {
  return estModeleCandidature(type) ? VARIABLES_CANDIDATURE : VARIABLES_DISPONIBLES;
}

/** Valeurs d'exemple pour l'aperçu d'un modèle dans les paramètres. */
export function variablesExemple(type: TypeModeleEmail): Record<string, string> {
  return estModeleCandidature(type)
    ? { candidat: "Awa Nkolo", poste: "Comptable", entreprise: "Votre entreprise" }
    : { client: "Awa Nkolo", numero: "DEV-2026-000042", montant: "150 000 FCFA", entreprise: "Votre entreprise" };
}

// Un modèle par défaut codé ici — pas en base — permet à toute entreprise
// d'envoyer un devis/une facture dès aujourd'hui sans configuration
// préalable ; recupererModele() ne s'en sert que si la ligne modele_email
// correspondante n'existe pas encore (voir src/db/schema.ts, modeleEmail).
const MODELES_PAR_DEFAUT: Record<TypeModeleEmail, { objet: string; corps: string }> = {
  ENVOI_DEVIS: {
    objet: "Devis {{numero}} — {{entreprise}}",
    corps:
      "Bonjour {{client}},\n\nVeuillez trouver ci-joint notre devis {{numero}} d'un montant de {{montant}}.\n\nN'hésitez pas à nous contacter pour toute question.\n\nCordialement,\n{{entreprise}}",
  },
  ENVOI_FACTURE: {
    objet: "Facture {{numero}} — {{entreprise}}",
    corps:
      "Bonjour {{client}},\n\nVeuillez trouver ci-joint la facture {{numero}} d'un montant de {{montant}}.\n\nCordialement,\n{{entreprise}}",
  },
  // Candidatures : le ton reste sobre et ne promet rien que l'entreprise n'a pas décidé. « Offre » annonce qu'une
  // proposition va suivre, jamais ses conditions ; le rejet remercie sans donner de motif.
  CANDIDATURE_EN_EXAMEN: {
    objet: "Votre candidature « {{poste}} » est en cours d'examen",
    corps:
      "Bonjour {{candidat}},\n\nNous avons bien reçu votre candidature pour le poste « {{poste}} » et l'équipe de {{entreprise}} l'examine actuellement. Nous reviendrons vers vous dès que possible.\n\nCordialement,\n{{entreprise}}",
  },
  CANDIDATURE_ENTRETIEN: {
    objet: "Entretien pour le poste « {{poste}} »",
    corps:
      "Bonjour {{candidat}},\n\nBonne nouvelle : votre profil a retenu l'attention de {{entreprise}} pour le poste « {{poste}} ». Nous vous contacterons très prochainement pour convenir d'un entretien.\n\nCordialement,\n{{entreprise}}",
  },
  CANDIDATURE_OFFRE: {
    objet: "Suite de votre candidature « {{poste}} »",
    corps:
      "Bonjour {{candidat}},\n\nAprès les échanges menés, {{entreprise}} souhaite vous faire une proposition pour le poste « {{poste}} ». Nous vous contacterons très prochainement pour vous la présenter.\n\nCordialement,\n{{entreprise}}",
  },
  CANDIDATURE_EMBAUCHE: {
    objet: "Bienvenue — poste « {{poste}} »",
    corps:
      "Bonjour {{candidat}},\n\nFélicitations ! {{entreprise}} est heureux de vous accueillir pour le poste « {{poste}} ». Nous vous contacterons très prochainement pour les prochaines étapes.\n\nCordialement,\n{{entreprise}}",
  },
  CANDIDATURE_REJETEE: {
    objet: "Votre candidature « {{poste}} »",
    corps:
      "Bonjour {{candidat}},\n\nNous vous remercions de l'intérêt que vous avez porté au poste « {{poste}} » chez {{entreprise}}. Après un examen attentif, nous ne pouvons pas donner suite à votre candidature pour le moment. Nous vous souhaitons plein succès dans vos recherches.\n\nCordialement,\n{{entreprise}}",
  },
};

export function interpoler(texte: string, variables: Record<string, string>): string {
  return texte.replace(/\{\{(\w+)\}\}/g, (correspondance, cle: string) =>
    Object.prototype.hasOwnProperty.call(variables, cle) ? variables[cle] : correspondance
  );
}

// react-pdf/react-email ne sont pas nécessaires pour un corps aussi simple —
// un <p> par ligne suffit, cohérent avec l'esprit "gabarit minimal" déjà
// choisi pour gabaritRelanceFacture.
/**
 * Le texte est échappé : il peut contenir des données saisies par un tiers
 * (nom d'un client, réponse d'un visiteur anonyme à un formulaire, candidature).
 * Sans cela, du HTML injecté (liens, images, mise en forme trompeuse) serait
 * rendu tel quel dans l'email reçu par l'entreprise.
 */
export function echapperHtml(texte: string): string {
  return texte.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export function corpsVersHtml(corps: string): string {
  return corps
    .split("\n")
    .map((ligne) => `<p>${ligne.length > 0 ? echapperHtml(ligne) : "&nbsp;"}</p>`)
    .join("\n");
}

export async function recupererModele(
  tx: TransactionDrizzle,
  entrepriseId: string,
  type: TypeModeleEmail
): Promise<{ objet: string; corps: string }> {
  const [modelePersonnalise] = await tx
    .select({ objet: modeleEmail.objet, corps: modeleEmail.corps })
    .from(modeleEmail)
    .where(and(eq(modeleEmail.entrepriseId, entrepriseId), eq(modeleEmail.type, type)));

  return modelePersonnalise ?? MODELES_PAR_DEFAUT[type];
}

export function modeleParDefaut(type: TypeModeleEmail): { objet: string; corps: string } {
  return MODELES_PAR_DEFAUT[type];
}
