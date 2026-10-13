"use server";

import { and, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { avecEntreprise } from "@/db/client";
import { connexionFacebook, routageFacebookPage } from "@/db/schema";
import { recupererUtilisateurConnecte, type UtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { getT } from "@/lib/i18n/langue";
import { m } from "@/lib/i18n/catalogue";
import { COOKIE_NONCE, COOKIE_PAGES } from "@/lib/facebook/evenements";
import { CONTEXTE_COOKIE_PAGES, CONTEXTE_JETON_PAGE, chiffrer, creerEtat, dechiffrer, nouveauNonce } from "@/lib/facebook/jetons";
import { abonnerPage, adresseConnexionFacebook, desabonnerPage, facebookConfigure, type PageFacebook } from "@/lib/facebook/graph";

/** Seul l'Administrateur relie une page : elle déverse des prospects dans le CRM et donne accès à un compte Facebook. Revérifié à chaque appel. */
async function administrateur(): Promise<UtilisateurConnecte> {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (utilisateurConnecte.role !== "ADMIN" || !peut(utilisateurConnecte, "PARAMETRES", "MODIFIER")) redirect("/app");
  return utilisateurConnecte;
}

function adresseRetour(): string {
  return `${process.env.BETTER_AUTH_URL ?? "http://localhost:3000"}/api/facebook/callback`;
}

export type EtatFacebook = { erreur: string } | { ok: true } | null;

/** Ouvre la fenêtre de connexion de Facebook : l'état signé lie le retour à cet utilisateur et à ce navigateur. */
export async function demarrerConnexionFacebook(): Promise<EtatFacebook> {
  const t = await getT();
  const utilisateurConnecte = await administrateur();
  if (!facebookConfigure()) return { erreur: t("La connexion Facebook n'est pas encore activée sur cette plateforme.") };

  const nonce = nouveauNonce();
  (await cookies()).set(COOKIE_NONCE, nonce, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 600 });
  redirect(adresseConnexionFacebook(adresseRetour(), creerEtat(utilisateurConnecte.utilisateurId, nonce)));
}

async function pagesProposees(): Promise<PageFacebook[]> {
  const brut = (await cookies()).get(COOKIE_PAGES)?.value;
  const clair = brut ? dechiffrer(brut, CONTEXTE_COOKIE_PAGES) : null;
  if (!clair) return [];
  try {
    const pages = JSON.parse(clair) as PageFacebook[];
    return pages.filter((p) => typeof p?.id === "string" && typeof p.nom === "string" && typeof p.jeton === "string");
  } catch {
    return [];
  }
}

/** Noms des pages à choisir (jamais leurs jetons) : lus dans le cookie chiffré posé au retour de Facebook. */
export async function listerPagesAChoisir(): Promise<{ id: string; nom: string }[]> {
  await administrateur();
  return (await pagesProposees()).map((p) => ({ id: p.id, nom: p.nom }));
}

const MESSAGE_DEJA_RELIEE = m("Cette page est déjà reliée à un autre espace Vertex One.");

/**
 * Relie la page choisie : abonnement aux prospects chez Meta, puis jeton chiffré et routage en base. `pageId` n'est
 * jamais cru : la page doit figurer dans la liste que Facebook vient de renvoyer pour CET administrateur (cookie chiffré).
 */
export async function connecterPageFacebook(pageId: string): Promise<EtatFacebook> {
  const t = await getT();
  const utilisateurConnecte = await administrateur();
  const page = (await pagesProposees()).find((p) => p.id === pageId);
  if (!page) return { erreur: t("Cette liste de pages a expiré. Relancez la connexion Facebook.") };

  const abonnement = await abonnerPage(page.id, page.jeton);
  if (!abonnement.ok) return { erreur: `${t("Facebook a refusé d'abonner la page :")} ${abonnement.erreur}` };

  try {
    await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
      const [existante] = await tx.select({ id: connexionFacebook.id }).from(connexionFacebook).where(and(eq(connexionFacebook.entrepriseId, utilisateurConnecte.entrepriseId), eq(connexionFacebook.pageId, page.id)));
      const jetonChiffre = chiffrer(page.jeton, CONTEXTE_JETON_PAGE);
      if (existante) {
        await tx.update(connexionFacebook).set({ jetonChiffre, pageNom: page.nom }).where(eq(connexionFacebook.id, existante.id));
        return;
      }
      // L'index unique est mondial : si une AUTRE entreprise possède déjà cette page, l'insertion échoue et rien n'est écrit.
      await tx.insert(routageFacebookPage).values({ entrepriseId: utilisateurConnecte.entrepriseId, pageId: page.id });
      await tx.insert(connexionFacebook).values({ entrepriseId: utilisateurConnecte.entrepriseId, pageId: page.id, pageNom: page.nom, jetonChiffre, connecteParId: utilisateurConnecte.utilisateurId });
    });
  } catch (erreur) {
    if (erreur instanceof Error && /unique|23505|duplicate/i.test(`${erreur.message} ${(erreur as { code?: string }).code ?? ""}`)) {
      await desabonnerPage(page.id, page.jeton); // l'abonnement ne doit pas rester actif pour une page qu'on ne relie pas
      return { erreur: t(MESSAGE_DEJA_RELIEE) };
    }
    throw erreur;
  }

  (await cookies()).delete(COOKIE_PAGES);
  revalidatePath("/app/parametres/integrations");
  return { ok: true };
}

/** Coupe la liaison : suppression de la page de l'entreprise (jeton compris), puis désabonnement chez Meta sans bloquer. */
export async function deconnecterPageFacebook(connexionId: string): Promise<EtatFacebook> {
  const utilisateurConnecte = await administrateur();

  const jetonClair = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [connexion] = await tx.select().from(connexionFacebook).where(and(eq(connexionFacebook.id, connexionId), eq(connexionFacebook.entrepriseId, utilisateurConnecte.entrepriseId)));
    if (!connexion) return null;
    await tx.delete(routageFacebookPage).where(and(eq(routageFacebookPage.pageId, connexion.pageId), eq(routageFacebookPage.entrepriseId, utilisateurConnecte.entrepriseId)));
    await tx.delete(connexionFacebook).where(eq(connexionFacebook.id, connexion.id));
    return { pageId: connexion.pageId, jeton: dechiffrer(connexion.jetonChiffre, CONTEXTE_JETON_PAGE) };
  });
  if (jetonClair?.jeton) await desabonnerPage(jetonClair.pageId, jetonClair.jeton);

  revalidatePath("/app/parametres/integrations");
  return { ok: true };
}
