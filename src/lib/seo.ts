import type { Metadata } from "next";

/** Base absolue du site — même variable que le reste du projet (voir urlBase() dans src/lib/actions/abonnement.ts). */
export const URL_SITE = process.env.BETTER_AUTH_URL ?? "https://vertexone.cm";

/** Image de partage par défaut (réseaux sociaux) — le logo officiel, en attendant une image dédiée 1200×630. */
const IMAGE_PARTAGE_DEFAUT = "/marque/logo.png";

/**
 * Construit un objet Metadata complet (Open Graph, Twitter, URL canonique) à partir du titre/description déjà
 * définis par chaque page — pour ne pas dupliquer ce bloc dans chacune. `titre` et `description` gardent leur
 * traduction déjà faite via t()/getTVisiteur() côté appelant, cette fonction ne fait qu'assembler.
 */
export function metadonneesSite(params: { titre: string; description: string; chemin?: string; image?: string }): Metadata {
  const chemin = params.chemin ?? "";
  const url = `${URL_SITE}${chemin}`;
  const image = params.image ?? IMAGE_PARTAGE_DEFAUT;

  return {
    title: params.titre,
    description: params.description,
    alternates: { canonical: url },
    openGraph: {
      title: params.titre,
      description: params.description,
      url,
      siteName: "Vertex One",
      images: [{ url: image }],
      locale: "fr_FR",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: params.titre,
      description: params.description,
      images: [image],
    },
  };
}
