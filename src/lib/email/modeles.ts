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
