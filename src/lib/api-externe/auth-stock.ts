import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { cleApiEntreprise, entreprise } from "@/db/schema";
import { empreinteCle, formeCleValide, lireCleDepuisEnTete } from "./cle";
import { autoriserAppel } from "./limite";
import type { CleStock } from "./stock-site";

export const TAILLE_MAX_OCTETS = 20_000;

export const reponse = (corps: Record<string, unknown>, statut: number) =>
  NextResponse.json(corps, { status: statut, headers: { "Cache-Control": "no-store" } });

/**
 * Authentification des appels de la boutique en ligne connectée (lecture du stock, commandes, annulations). Même principe que les autres
 * points d'entrée externes : `Authorization: Bearer vo_…`, appel de serveur à serveur, l'entreprise est TOUJOURS déduite de la clé. La clé
 * doit en plus avoir été autorisée à gérer le stock par l'Administrateur (refusé par défaut). Toute erreur d'authentification renvoie la
 * même réponse 401, sans dire si la clé existe.
 */
export async function authentifierCleStock(requete: Request): Promise<{ ok: true; entrepriseId: string; cle: CleStock; creeParId: string } | { ok: false; reponse: NextResponse }> {
  const cle = lireCleDepuisEnTete(requete.headers.get("authorization"));
  if (!cle || !formeCleValide(cle)) return { ok: false, reponse: reponse({ erreur: "Clé d'API invalide." }, 401) };

  // Lecture anonyme par empreinte (politique RLS permissive hors session), puis tout le reste sous la RLS de l'entreprise.
  const [ligne] = await db.select().from(cleApiEntreprise).where(eq(cleApiEntreprise.empreinte, empreinteCle(cle)));
  if (!ligne || ligne.revoqueeLe) return { ok: false, reponse: reponse({ erreur: "Clé d'API invalide." }, 401) };
  if (!ligne.autoriseStock) {
    return { ok: false, reponse: reponse({ erreur: "Cette clé n'est pas autorisée à gérer le stock : connectez votre boutique dans Vertex One (Paramètres → Intégrations → Boutique en ligne)." }, 403) };
  }

  const [ent] = await db.select({ statutAbonnement: entreprise.statutAbonnement }).from(entreprise).where(eq(entreprise.id, ligne.entrepriseId));
  if (!ent || ent.statutAbonnement === "suspendu") {
    return { ok: false, reponse: reponse({ erreur: "Abonnement suspendu : le stock n'est plus synchronisé. Réactivez l'abonnement dans Vertex One." }, 402) };
  }

  if (!autoriserAppel(ligne.id)) return { ok: false, reponse: reponse({ erreur: "Trop de requêtes, réessayez dans une minute." }, 429) };

  return { ok: true, entrepriseId: ligne.entrepriseId, cle: { id: ligne.id, nom: ligne.nom, depotStockId: ligne.depotStockId }, creeParId: ligne.creeParId };
}

/** Lit et valide un corps JSON borné ; renvoie la réponse d'erreur toute prête sinon. */
export async function lireCorpsJson(requete: Request): Promise<{ ok: true; corps: unknown } | { ok: false; reponse: NextResponse }> {
  const annonce = Number(requete.headers.get("content-length") ?? 0);
  if (annonce > TAILLE_MAX_OCTETS) return { ok: false, reponse: reponse({ erreur: "Requête trop volumineuse." }, 413) };
  const brut = await requete.text();
  if (brut.length > TAILLE_MAX_OCTETS) return { ok: false, reponse: reponse({ erreur: "Requête trop volumineuse." }, 413) };
  try {
    return { ok: true, corps: JSON.parse(brut) };
  } catch {
    return { ok: false, reponse: reponse({ erreur: "Le corps doit être du JSON valide." }, 400) };
  }
}
