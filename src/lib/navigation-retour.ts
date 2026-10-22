/**
 * Chemin de retour passé dans l'adresse (`?retour=/app/facturation/devis/…`) pour qu'une page de réglage ramène à la page
 * d'où l'on vient. Seule une adresse INTERNE à l'application est acceptée (jamais un lien externe : ce serait une
 * redirection ouverte) ; toute autre valeur est ignorée.
 */
export function cheminRetourSur(valeur: string | undefined | null): string | null {
  if (!valeur || valeur.length > 200) return null;
  return /^\/app\/[A-Za-z0-9\-_/]*$/.test(valeur) && !valeur.includes("//") ? valeur : null;
}

/** Libellé du bouton de retour selon la page d'origine. */
export function libelleRetour(chemin: string): "devis" | "facture" | "page" {
  if (chemin.startsWith("/app/facturation/devis/")) return "devis";
  if (chemin.startsWith("/app/facturation/factures/")) return "facture";
  return "page";
}
