import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { recupererUtilisateurConnecte, type Langue } from "@/lib/session";
import { traducteur, type Traducteur } from "./catalogue";

import { COOKIE_LANGUE } from "./cookie-langue";

/**
 * Langue d'un visiteur sans compte (site vitrine, connexion, pages envoyées à un client) : son choix mémorisé dans un
 * cookie, sinon la langue de son navigateur, sinon le français. Aucune base de données consultée.
 */
export async function langueVisiteur(): Promise<Langue> {
  const choix = (await cookies()).get(COOKIE_LANGUE)?.value;
  if (choix === "fr" || choix === "en") return choix;
  const navigateur = (await headers()).get("accept-language") ?? "";
  // Le premier code de langue de l'en-tête (le plus préféré) : « en-US,en;q=0.9,fr;q=0.8 » → en.
  return navigateur.trim().toLowerCase().startsWith("en") ? "en" : "fr";
}

/**
 * Langue de la personne qui charge la page : sa préférence enregistrée si elle est connectée, sinon celle du visiteur.
 * Mémorisée le temps d'une requête : appelée par dix composants, elle ne relit la session qu'une fois.
 */
export const langueCourante = cache(async (): Promise<Langue> => {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  return utilisateurConnecte?.langue ?? (await langueVisiteur());
});

/** Traducteur d'un composant serveur : `const t = await getT();`. */
export async function getT(): Promise<Traducteur> {
  return traducteur(await langueCourante());
}
