/**
 * Lien d'un email : un vrai lien à l'envoi ; dans l'aperçu avant envoi (`lien` nul) un texte à l'allure de lien mais
 * inerte — le vrai lien n'existe qu'à l'envoi, et un `href` factice rechargerait l'application dans le cadre de l'aperçu
 * (où l'on n'est pas connecté : page de connexion).
 */
export function lienEmail(lien: string | null, libelle: string): string {
  return lien ? `<p><a href="${lien}">${libelle}</a></p>` : `<p><span style="color:#0000ee;text-decoration:underline">${libelle}</span></p>`;
}
