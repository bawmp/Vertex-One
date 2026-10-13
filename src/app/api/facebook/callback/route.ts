import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { CONTEXTE_COOKIE_PAGES, chiffrer, verifierEtat } from "@/lib/facebook/jetons";
import { COOKIE_NONCE, COOKIE_PAGES } from "@/lib/facebook/evenements";
import { jetonUtilisateurLongueDuree, listerPages } from "@/lib/facebook/graph";

/**
 * Retour de la connexion Facebook (2026-10-13). Facebook y renvoie la personne avec un `code` et le `state` créé par
 * `demarrerConnexionFacebook()`. On vérifie que l'état est signé, récent, émis pour CET utilisateur et CE navigateur (cookie
 * de nonce), puis on échange le code, on liste les pages de la personne et on les garde dans un cookie httpOnly CHIFFRÉ
 * de 10 minutes : l'Administrateur choisit alors la page à relier (`connecterPageFacebook`). Aucun jeton n'est jamais
 * écrit dans l'adresse de redirection ni envoyé au navigateur en clair.
 */
const MAX_PAGES = 15; // un cookie ne dépasse pas ~4 Ko

function retour(base: string, statut: string) {
  return NextResponse.redirect(new URL(`/app/parametres/integrations?facebook=${statut}`, base));
}

export async function GET(requete: Request) {
  const base = process.env.BETTER_AUTH_URL ?? new URL(requete.url).origin;
  const url = new URL(requete.url);

  const utilisateur = await recupererUtilisateurConnecte();
  if (!utilisateur) return NextResponse.redirect(new URL("/connexion", base));
  if (utilisateur.role !== "ADMIN" || !peut(utilisateur, "PARAMETRES", "MODIFIER")) return retour(base, "refuse");

  const jar = await cookies();
  const nonce = jar.get(COOKIE_NONCE)?.value;
  jar.delete(COOKIE_NONCE);

  if (url.searchParams.get("error")) return retour(base, "annule"); // la personne a refusé les autorisations
  const etat = verifierEtat(url.searchParams.get("state") ?? "");
  if (!etat || !nonce || etat.nonce !== nonce || etat.utilisateurId !== utilisateur.utilisateurId) return retour(base, "etat");

  const code = url.searchParams.get("code");
  if (!code) return retour(base, "erreur");

  const jeton = await jetonUtilisateurLongueDuree(code, `${base}/api/facebook/callback`);
  if (!jeton.ok) return retour(base, "erreur");
  const pages = await listerPages(jeton.donnees);
  if (!pages.ok || pages.donnees.length === 0) return retour(base, pages.ok ? "aucune-page" : "erreur");

  jar.set(COOKIE_PAGES, chiffrer(JSON.stringify(pages.donnees.slice(0, MAX_PAGES)), CONTEXTE_COOKIE_PAGES), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return retour(base, "choisir");
}
