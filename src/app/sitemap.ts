import type { MetadataRoute } from "next";
import { URL_SITE } from "@/lib/seo";
import { MODULES_MARKETING } from "@/lib/marketing/modules";

/**
 * Uniquement les pages corporate de Vertex One elle-même — jamais les pages publiques propres à une entreprise
 * cliente (/carrieres/[slug], /reserver/[slug], /p/[slug], /formulaire/[slug]...) : ce sont les sites de nos
 * clients, pas le nôtre, et les lister nécessiterait une lecture publique de la liste des entreprises actives,
 * hors sujet ici.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const maintenant = new Date();

  const pagesStatiques: MetadataRoute.Sitemap = [
    { url: URL_SITE, lastModified: maintenant, changeFrequency: "weekly", priority: 1 },
    { url: `${URL_SITE}/tarifs`, lastModified: maintenant, changeFrequency: "monthly", priority: 0.9 },
    { url: `${URL_SITE}/modules`, lastModified: maintenant, changeFrequency: "monthly", priority: 0.9 },
    { url: `${URL_SITE}/a-propos`, lastModified: maintenant, changeFrequency: "monthly", priority: 0.6 },
    { url: `${URL_SITE}/contact`, lastModified: maintenant, changeFrequency: "yearly", priority: 0.5 },
    { url: `${URL_SITE}/inscription`, lastModified: maintenant, changeFrequency: "monthly", priority: 0.8 },
  ];

  const pagesModules: MetadataRoute.Sitemap = MODULES_MARKETING.map((module) => ({
    url: `${URL_SITE}/modules/${module.slug}`,
    lastModified: maintenant,
    changeFrequency: "monthly",
    priority: 0.7,
  }));

  return [...pagesStatiques, ...pagesModules];
}
