import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { avecEntreprise } from "@/db/client";
import { cleApiEntreprise } from "@/db/schema";
import { authentifierCleStock, lireCorpsJson, reponse } from "@/lib/api-externe/auth-stock";
import { annulerCommandeSite, schemaAnnulationSite } from "@/lib/api-externe/stock-site";

/**
 * POST /api/externe/stock/commandes/annulation — le site annule une commande déjà déclarée (client qui renonce, paiement échoué) : les
 * articles sortis reviennent en stock. Corps : { reference }. Idempotent : annuler deux fois ne remet rien en stock la seconde fois (200).
 * 404 si cette clé n'a jamais déclaré cette référence.
 */
export async function POST(requete: Request) {
  const auth = await authentifierCleStock(requete);
  if (!auth.ok) return auth.reponse;

  const lecture = await lireCorpsJson(requete);
  if (!lecture.ok) return lecture.reponse;
  const analyse = schemaAnnulationSite.safeParse(lecture.corps);
  if (!analyse.success) return reponse({ erreur: analyse.error.issues[0]?.message ?? "Données invalides." }, 400);

  let resultat: Awaited<ReturnType<typeof annulerCommandeSite>>;
  try {
    resultat = await avecEntreprise(auth.entrepriseId, async (tx) => {
      await tx.update(cleApiEntreprise).set({ dernierUsageLe: new Date() }).where(eq(cleApiEntreprise.id, auth.cle.id));
      return annulerCommandeSite(tx, auth.entrepriseId, auth.cle, analyse.data.reference);
    });
  } catch (erreur) {
    console.error("[api-externe] annulation de commande du site impossible :", erreur instanceof Error ? erreur.message : erreur);
    return reponse({ erreur: "L'annulation n'a pas pu être enregistrée pour le moment, réessayez." }, 500);
  }

  if (resultat.introuvable) return reponse({ erreur: "Aucune commande avec cette référence." }, 404);
  if (!resultat.doublon) {
    revalidatePath("/app/produits");
    revalidatePath("/app/parametres/integrations");
  }
  return reponse({ statut: "ANNULEE", doublon: resultat.doublon, produitsRemisEnStock: resultat.remisEnStock }, 200);
}

// Aucun autre verbe n'est servi : Next répond 405.
