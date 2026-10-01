import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { recupererUtilisateurConnecte, type Langue } from "@/lib/session";
import { traducteur, type Traducteur } from "./catalogue";

import { COOKIE_LANGUE } from "./cookie-langue";

/**
 * Langue d'un visiteur sans compte (site vitrine, connexion, pages envoyées à un client) : son choix mémorisé dans
 * un cookie, sinon le français — jamais la langue du navigateur (corrigé le 2026-10-01 : de nombreux téléphones
 * vendus au Cameroun ont l'anglais comme langue système même chez des utilisateurs francophones, ce qui faisait
 * basculer tout le site vitrine en anglais sans que le visiteur ait rien demandé, particulièrement visible sur
 * mobile où le sélecteur de langue est moins visible que sur bureau — bug réel constaté en testant depuis un
 * profil mobile). Le français reste "la langue source du produit" (voir CLAUDE.md) : un visiteur voit toujours le
 * français par défaut, l'anglais n'arrive que par un choix explicite via le sélecteur. Aucune base de données
 * consultée.
 */
export async function langueVisiteur(): Promise<Langue> {
  const choix = (await cookies()).get(COOKIE_LANGUE)?.value;
  return choix === "en" ? "en" : "fr";
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

/**
 * Traducteur qui IGNORE délibérément la préférence de compte, même si la personne est connectée (2026-09-23, bug réel
 * corrigé : un visiteur connecté — cas fréquent, une session Better-Auth ne se limite pas à /app — qui cliquait sur
 * le sélecteur de langue du site vitrine ou de la page de connexion voyait le cookie bien posé, mais le contenu
 * rester en français malgré tout, parce que getT()/langueCourante() donnaient toujours la priorité à la langue de
 * son compte). Réservé aux pages publiques ((marketing), (auth)) — jamais à /app ou /portail, qui doivent au
 * contraire respecter la préférence enregistrée du compte (voir getT() ci-dessus).
 */
export async function getTVisiteur(): Promise<Traducteur> {
  return traducteur(await langueVisiteur());
}
