import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { avecEntreprise } from "@/db/client";
import { cleApiEntreprise } from "@/db/schema";
import { authentifierCleStock, lireCorpsJson, reponse } from "@/lib/api-externe/auth-stock";
import { enregistrerCommandeSite, schemaCommandeSite } from "@/lib/api-externe/stock-site";

/**
 * POST /api/externe/stock/commandes — le site connecté déclare une commande : Vertex One fait sortir le stock (comme une vente) et
 * répond, pour chaque ligne, si elle a été reconnue et combien il en reste. Corps : { reference, lignes: [{ code, quantite }] } où « code »
 * est le code-barres du produit dans Vertex One.
 *
 * Une commande n'est JAMAIS refusée pour cause de stock ou de code inconnu (le client a déjà commandé) : les lignes à problème sont
 * signalées (« inconnu », « non_suivi ») et l'Administrateur les voit dans Paramètres → Intégrations. Idempotent par référence : renvoyer
 * la même commande répond 200 sans faire sortir le stock une seconde fois.
 */
export async function POST(requete: Request) {
  const auth = await authentifierCleStock(requete);
  if (!auth.ok) return auth.reponse;

  const lecture = await lireCorpsJson(requete);
  if (!lecture.ok) return lecture.reponse;
  const analyse = schemaCommandeSite.safeParse(lecture.corps);
  if (!analyse.success) return reponse({ erreur: analyse.error.issues[0]?.message ?? "Données invalides." }, 400);

  let resultat: Awaited<ReturnType<typeof enregistrerCommandeSite>>;
  try {
    resultat = await avecEntreprise(auth.entrepriseId, async (tx) => {
      await tx.update(cleApiEntreprise).set({ dernierUsageLe: new Date() }).where(eq(cleApiEntreprise.id, auth.cle.id));
      return enregistrerCommandeSite(tx, auth.entrepriseId, auth.cle, analyse.data);
    });
  } catch (erreur) {
    // Toute la transaction est annulée (jamais un stock à moitié sorti) : le site réessaiera avec la même référence.
    console.error("[api-externe] commande du site impossible :", erreur instanceof Error ? erreur.message : erreur);
    return reponse({ erreur: "La commande n'a pas pu être enregistrée pour le moment, réessayez." }, 500);
  }

  if (!resultat.doublon) {
    revalidatePath("/app/produits");
    revalidatePath("/app/parametres/integrations");
  }
  const problemes = resultat.lignes.filter((l) => l.statut !== "ok").map((l) => l.code);
  return reponse({ statut: resultat.statut, doublon: resultat.doublon, lignes: resultat.lignes, ...(problemes.length ? { aVerifier: problemes } : {}) }, resultat.doublon ? 200 : 201);
}

// Aucun autre verbe n'est servi : Next répond 405.
