import "server-only";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { connexionFacebook, entreprise, routageFacebookPage } from "@/db/schema";
import { creerLeadExterne } from "@/lib/api-externe/lead";
import { CONTEXTE_JETON_PAGE, dechiffrer } from "@/lib/facebook/jetons";
import { lireProspect } from "@/lib/facebook/graph";
import { leadDepuisProspectFacebook } from "@/lib/facebook/prospect";
import type { EvenementLeadgen } from "@/lib/facebook/evenements";

export type IssueTraitement =
  | { statut: "cree"; leadId: string; nom: string; message: string | null; assigneEmail: string | null }
  | { statut: "doublon" }
  | { statut: "ignore"; raison: "PAGE_INCONNUE" | "ABONNEMENT_SUSPENDU" | "JETON_ILLISIBLE" | "PROSPECT_ILLISIBLE" | "AUCUN_ADMIN" };

/**
 * Traite un événement « nouveau prospect » de Meta. L'entreprise est celle qui possède la PAGE (table de routage,
 * seule lecture anonyme) — jamais une valeur de la requête ; tout le reste (jeton, lead) passe par la RLS de cette
 * entreprise. Idempotent : un même prospect renvoyé par Meta ne crée jamais un deuxième lead.
 */
export async function traiterProspectFacebook(evenement: EvenementLeadgen): Promise<IssueTraitement> {
  const [route] = await db.select().from(routageFacebookPage).where(eq(routageFacebookPage.pageId, evenement.pageId));
  if (!route) return { statut: "ignore", raison: "PAGE_INCONNUE" };
  const entrepriseId = route.entrepriseId;

  // Même règle que l'API externe : un espace suspendu n'a plus accès à son CRM, on n'y dépose rien.
  const [ent] = await db.select({ statutAbonnement: entreprise.statutAbonnement }).from(entreprise).where(eq(entreprise.id, entrepriseId));
  if (!ent || ent.statutAbonnement === "suspendu") return { statut: "ignore", raison: "ABONNEMENT_SUSPENDU" };

  const jeton = await avecEntreprise(entrepriseId, async (tx) => {
    const [connexion] = await tx.select({ jetonChiffre: connexionFacebook.jetonChiffre }).from(connexionFacebook).where(eq(connexionFacebook.pageId, evenement.pageId));
    return connexion ? dechiffrer(connexion.jetonChiffre, CONTEXTE_JETON_PAGE) : null;
  });
  if (!jeton) return { statut: "ignore", raison: "JETON_ILLISIBLE" };

  const prospect = await lireProspect(evenement.leadgenId, jeton);
  if (!prospect.ok) {
    console.error(`[facebook] prospect ${evenement.leadgenId} illisible : ${prospect.erreur}`);
    return { statut: "ignore", raison: "PROSPECT_ILLISIBLE" };
  }

  const donnees = leadDepuisProspectFacebook(prospect.donnees, evenement.leadgenId);
  const resultat = await avecEntreprise(entrepriseId, async (tx) => {
    const lead = await creerLeadExterne(tx, entrepriseId, donnees);
    if (!("erreur" in lead) && !lead.doublon) {
      await tx.update(connexionFacebook).set({ dernierLeadLe: new Date() }).where(eq(connexionFacebook.pageId, evenement.pageId));
    }
    return lead;
  });

  if ("erreur" in resultat) return { statut: "ignore", raison: "AUCUN_ADMIN" };
  if (resultat.doublon) return { statut: "doublon" };
  return { statut: "cree", leadId: resultat.id, nom: resultat.nom, message: donnees.message ?? null, assigneEmail: resultat.assigneEmail };
}
