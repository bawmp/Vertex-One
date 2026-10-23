/**
 * Adresse de « l'espace client » d'un contact : la page où il suit sa procédure (ex. la page de suivi de dossier du site de
 * l'entreprise). Renseignée par le site de l'entreprise (API des leads) ou à la main sur la fiche du contact, puis proposée au
 * client à la fin de son parcours (devis accepté, facture payée). Seule une adresse https propre est acceptée : jamais un
 * `javascript:`, un `data:`, une adresse avec identifiants intégrés ou une chaîne mal formée — le client y est REDIRIGÉ.
 */
export const LONGUEUR_MAX_ESPACE_CLIENT = 500;

export function adresseEspaceClientSure(valeur: string | null | undefined): string | null {
  const brut = (valeur ?? "").trim();
  if (!brut || brut.length > LONGUEUR_MAX_ESPACE_CLIENT || /\s/.test(brut)) return null;
  try {
    const url = new URL(brut);
    if (url.protocol !== "https:" || url.username || url.password || !url.hostname.includes(".")) return null;
    return url.toString();
  } catch {
    return null;
  }
}
