import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { eq } from "drizzle-orm";
import { avecEntreprise } from "@/db/client";
import { cleApiEntreprise } from "@/db/schema";
import { authentifierCleStock, lireCorpsJson, reponse } from "@/lib/api-externe/auth-stock";
import { appliquerChangementsCatalogue, declarerProduitsSite, schemaChangementsCatalogue, schemaProduitsSite } from "@/lib/api-externe/stock-site";
import { chargerImagesEnAttente } from "@/lib/produits/image-distante";

/**
 * POST /api/externe/stock/produits — le site connecté déclare des produits (50 au plus par appel) pour qu'ils existent chez Vertex One avec le MÊME
 * code : un produit créé plus tard sur le site, ou un produit dont le stock n'est pas chiffré. Corps :
 * `{ produits: [{ code, nom, prixVente?, prixAchat?, description?, stock?, image? }] }`.
 *
 * Création seulement : un code déjà connu de Vertex One (même avec une autre casse) répond « existant » et n'est JAMAIS modifié — le produit de
 * Vertex One reste la référence. Avec `stock`, le produit est suivi et son stock de départ est enregistré ; sans `stock`, il est créé sans suivi.
 * `image` (adresse HTTPS) est téléchargée juste après la réponse, avec les gardes habituelles. Idempotent : rejouer le même appel ne crée rien de plus.
 * Même droit « stock » que les autres appels ; l'entreprise vient de la clé, jamais du corps.
 */
export async function POST(requete: Request) {
  const auth = await authentifierCleStock(requete);
  if (!auth.ok) return auth.reponse;

  const lecture = await lireCorpsJson(requete);
  if (!lecture.ok) return lecture.reponse;
  const analyse = schemaProduitsSite.safeParse(lecture.corps);
  if (!analyse.success) return reponse({ erreur: analyse.error.issues[0]?.message ?? "Données invalides." }, 400);

  let resultat: Awaited<ReturnType<typeof declarerProduitsSite>>;
  try {
    resultat = await avecEntreprise(auth.entrepriseId, async (tx) => {
      await tx.update(cleApiEntreprise).set({ dernierUsageLe: new Date() }).where(eq(cleApiEntreprise.id, auth.cle.id));
      return declarerProduitsSite(tx, auth.entrepriseId, auth.creeParId, analyse.data);
    });
  } catch (erreur) {
    console.error("[api-externe] déclaration de produits impossible :", erreur instanceof Error ? erreur.message : erreur);
    return reponse({ erreur: "Les produits n'ont pas pu être enregistrés pour le moment, réessayez." }, 500);
  }

  const crees = resultat.resultats.filter((r) => r.statut === "cree");
  if (crees.length > 0) {
    revalidatePath("/app/produits");
    revalidatePath("/app/parametres/integrations");
  }
  if (resultat.imagesAChargerNb > 0) {
    const entrepriseId = auth.entrepriseId;
    after(() => chargerImagesEnAttente(entrepriseId, { limite: 25, budgetMs: 40_000 }));
  }
  return reponse({ produits: resultat.resultats, crees: crees.length, existants: resultat.resultats.length - crees.length }, crees.length > 0 ? 201 : 200);
}

/**
 * PATCH /api/externe/stock/produits — le site renvoie ses changements de catalogue (50 produits au plus) : nom, description, prixVente, prixAchat, actif.
 * Corps : `{ produits: [{ code, vuLe, nom?, description?, prixVente?, prixAchat?, actif? }] }` où `vuLe` est la `modifieLe` lue dans le catalogue.
 * Par produit : « modifie » (avec la nouvelle `modifieLe`), « identique », « inconnu » (code absent) ou « conflit » (le produit a changé chez Vertex One
 * depuis `vuLe` : rien n'est écrit, le site relit le catalogue et décide). Jamais de création ni de suppression.
 */
export async function PATCH(requete: Request) {
  const auth = await authentifierCleStock(requete);
  if (!auth.ok) return auth.reponse;

  const lecture = await lireCorpsJson(requete);
  if (!lecture.ok) return lecture.reponse;
  const analyse = schemaChangementsCatalogue.safeParse(lecture.corps);
  if (!analyse.success) return reponse({ erreur: analyse.error.issues[0]?.message ?? "Données invalides." }, 400);

  let resultats: Awaited<ReturnType<typeof appliquerChangementsCatalogue>>;
  try {
    resultats = await avecEntreprise(auth.entrepriseId, async (tx) => {
      await tx.update(cleApiEntreprise).set({ dernierUsageLe: new Date() }).where(eq(cleApiEntreprise.id, auth.cle.id));
      return appliquerChangementsCatalogue(tx, auth.entrepriseId, analyse.data);
    });
  } catch (erreur) {
    console.error("[api-externe] changements de catalogue impossibles :", erreur instanceof Error ? erreur.message : erreur);
    return reponse({ erreur: "Les changements n'ont pas pu être enregistrés pour le moment, réessayez." }, 500);
  }
  if (resultats.some((r) => r.statut === "modifie")) revalidatePath("/app/produits");
  return reponse({ produits: resultats, modifies: resultats.filter((r) => r.statut === "modifie").length }, 200);
}

// Seuls POST et PATCH sont servis : Next répond 405 pour les autres verbes.
