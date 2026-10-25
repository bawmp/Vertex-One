import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { cleApiEntreprise, entreprise } from "@/db/schema";
import { empreinteCle, formeCleValide, lireCleDepuisEnTete } from "@/lib/api-externe/cle";
import { creerFactureExterne, schemaFactureExterne } from "@/lib/api-externe/facture";
import { autoriserAppel } from "@/lib/api-externe/limite";
import { libelleMoyenPaiement, notifierPaiementFacture } from "@/lib/paiement/recu-facture";

/**
 * POST /api/externe/factures — un site connecté (ex. Global Mobility, Vertex Technology) vient d'encaisser un paiement et demande à
 * Vertex One d'émettre la facture PAYÉE correspondante : contact, numéro, règlement et écritures comptables sont créés ici, le client
 * reçoit sa facture par email au nom de l'entreprise et l'Administrateur est prévenu. Même authentification que les leads
 * (`Authorization: Bearer vo_…`, appel de serveur à serveur, aucun CORS), MAIS la clé doit en plus avoir été autorisée à facturer par
 * l'Administrateur : une facture créée est une écriture comptable qu'on ne supprime jamais.
 *
 * L'entreprise est TOUJOURS déduite de la clé, jamais d'une valeur du corps. Toute erreur d'authentification renvoie la même réponse 401.
 */
const TAILLE_MAX_OCTETS = 10_000;

const reponse = (corps: Record<string, unknown>, statut: number) =>
  NextResponse.json(corps, { status: statut, headers: { "Cache-Control": "no-store" } });

export async function POST(requete: Request) {
  const cle = lireCleDepuisEnTete(requete.headers.get("authorization"));
  if (!cle || !formeCleValide(cle)) return reponse({ erreur: "Clé d'API invalide." }, 401);

  const annonce = Number(requete.headers.get("content-length") ?? 0);
  if (annonce > TAILLE_MAX_OCTETS) return reponse({ erreur: "Requête trop volumineuse." }, 413);

  // Lecture anonyme par empreinte (politique RLS permissive hors session), puis tout le reste sous la RLS de l'entreprise.
  const [ligneCle] = await db.select().from(cleApiEntreprise).where(eq(cleApiEntreprise.empreinte, empreinteCle(cle)));
  if (!ligneCle || ligneCle.revoqueeLe) return reponse({ erreur: "Clé d'API invalide." }, 401);
  if (!ligneCle.autoriseFacturation) return reponse({ erreur: "Cette clé n'est pas autorisée à créer des factures : l'administrateur doit l'autoriser dans Paramètres → Intégrations." }, 403);

  const [ent] = await db.select({ statutAbonnement: entreprise.statutAbonnement }).from(entreprise).where(eq(entreprise.id, ligneCle.entrepriseId));
  if (!ent || ent.statutAbonnement === "suspendu") {
    return reponse({ erreur: "Abonnement suspendu : les factures ne sont plus acceptées. Réactivez l'abonnement dans Vertex One." }, 402);
  }

  if (!autoriserAppel(ligneCle.id)) return reponse({ erreur: "Trop de requêtes, réessayez dans une minute." }, 429);

  const brut = await requete.text();
  if (brut.length > TAILLE_MAX_OCTETS) return reponse({ erreur: "Requête trop volumineuse." }, 413);

  let corps: unknown;
  try {
    corps = JSON.parse(brut);
  } catch {
    return reponse({ erreur: "Le corps doit être du JSON valide." }, 400);
  }

  const analyse = schemaFactureExterne.safeParse(corps);
  if (!analyse.success) return reponse({ erreur: analyse.error.issues[0]?.message ?? "Données invalides." }, 400);

  let resultat: Awaited<ReturnType<typeof creerFactureExterne>>;
  try {
    resultat = await avecEntreprise(ligneCle.entrepriseId, async (tx) => {
      await tx.update(cleApiEntreprise).set({ dernierUsageLe: new Date() }).where(eq(cleApiEntreprise.id, ligneCle.id));
      return creerFactureExterne(tx, ligneCle.entrepriseId, analyse.data);
    });
  } catch (erreur) {
    // Toute la transaction est annulée (jamais une facture à moitié créée, ni un numéro perdu) : le site réessaiera.
    console.error("[api-externe] création de facture impossible :", erreur instanceof Error ? erreur.message : erreur);
    return reponse({ erreur: "La facture n'a pas pu être créée pour le moment, réessayez." }, 500);
  }

  if ("erreur" in resultat) return reponse({ erreur: "Aucun administrateur actif n'est disponible pour recevoir cette facture." }, 409);

  const base = (process.env.BETTER_AUTH_URL ?? "http://localhost:3000").replace(/\/+$/, "");
  const lien = `${base}/facture/${resultat.jeton}`;
  const corpsReponse = { id: resultat.factureId, numero: resultat.numero, urlFacture: lien, urlPdf: `${lien}/pdf`, doublon: resultat.doublon };
  if (resultat.doublon) return reponse(corpsReponse, 200);

  revalidatePath("/app/facturation");
  revalidatePath("/app");

  // L'Administrateur est prévenu et le client reçoit sa facture APRÈS la réponse : le site émetteur n'attend jamais l'envoi (rendu du PDF
  // et Resend), et un échec d'envoi ne défait pas la facture.
  notifierPaiementFacture({
    entrepriseId: ligneCle.entrepriseId,
    adresses: resultat.adresses,
    nomClient: resultat.nomClient,
    emailClient: resultat.emailClient,
    numeroFacture: resultat.numero,
    factureId: resultat.factureId,
    contactId: resultat.contactId,
    montant: resultat.montantTTC,
    moyen: libelleMoyenPaiement(resultat.operateur),
    resteAPayer: 0,
  });

  return reponse(corpsReponse, 201);
}

// Aucun autre verbe n'est servi : Next répond 405 pour GET, PUT, DELETE...
