import { NextResponse } from "next/server";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { cleApiEntreprise, entreprise } from "@/db/schema";
import { empreinteCle, formeCleValide, lireCleDepuisEnTete } from "@/lib/api-externe/cle";
import { creerLeadExterne, schemaLeadExterne } from "@/lib/api-externe/lead";
import { autoriserAppel } from "@/lib/api-externe/limite";
import { envoyerEmail } from "@/lib/email/client";
import { gabaritNouveauLeadExterne } from "@/lib/email/gabarits";

/**
 * POST /api/externe/leads — un site externe de l'entreprise (ex. Global Mobility) y dépose une demande, qui devient un
 * lead de son CRM. Authentification par clé d'API (`Authorization: Bearer vo_…`), jamais par session ni par cookie :
 * appel de serveur à serveur, donc aucun en-tête CORS (un navigateur tiers ne peut pas l'appeler).
 *
 * L'entreprise est TOUJOURS déduite de la clé, jamais d'une valeur du corps. Toute erreur d'authentification renvoie la
 * même réponse 401 (clé absente, mal formée, inconnue ou révoquée) pour ne rien révéler sur les clés existantes.
 */
const TAILLE_MAX_OCTETS = 20_000;

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

  // Un espace dont l'abonnement est suspendu n'a plus accès à son CRM (voir src/app/app/layout.tsx) : ses leads ne sont
  // donc pas acceptés non plus. Réponse 402 explicite — le site émetteur la journalise sans la réessayer — plutôt que
  // de remplir en silence un CRM que personne ne peut ouvrir. `entreprise` n'a pas de RLS (lecture directe, comme partout).
  const [ent] = await db.select({ statutAbonnement: entreprise.statutAbonnement }).from(entreprise).where(eq(entreprise.id, ligneCle.entrepriseId));
  if (!ent || ent.statutAbonnement === "suspendu") {
    return reponse({ erreur: "Abonnement suspendu : les demandes ne sont plus acceptées. Réactivez l'abonnement dans Vertex One." }, 402);
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

  const analyse = schemaLeadExterne.safeParse(corps);
  if (!analyse.success) return reponse({ erreur: analyse.error.issues[0]?.message ?? "Données invalides." }, 400);

  const resultat = await avecEntreprise(ligneCle.entrepriseId, async (tx) => {
    await tx.update(cleApiEntreprise).set({ dernierUsageLe: new Date() }).where(eq(cleApiEntreprise.id, ligneCle.id));
    return creerLeadExterne(tx, ligneCle.entrepriseId, analyse.data);
  });

  if ("erreur" in resultat) return reponse({ erreur: "Aucun administrateur actif n'est disponible pour recevoir cette demande." }, 409);

  if (resultat.doublon) return reponse({ id: resultat.id, doublon: true }, 200);

  revalidatePath("/app/leads");

  // Alerte à l'administrateur APRÈS la réponse : l'envoi (Resend) ne fait jamais attendre le site émetteur, et un échec
  // d'envoi ne défait pas la création du lead.
  if (resultat.assigneEmail) {
    const base = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
    const { subject, html } = gabaritNouveauLeadExterne({ nom: resultat.nom, source: resultat.source, message: analyse.data.message ?? null, lien: `${base}/app/leads/${resultat.id}` });
    const destinataire = resultat.assigneEmail;
    after(async () => {
      try {
        await envoyerEmail({ to: destinataire, subject, html });
      } catch (erreur) {
        console.error("[api-externe] alerte nouveau lead impossible :", erreur instanceof Error ? erreur.message : erreur);
      }
    });
  }

  return reponse({ id: resultat.id, doublon: false }, 201);
}

// Aucun autre verbe n'est servi : Next répond 405 pour GET, PUT, DELETE...
