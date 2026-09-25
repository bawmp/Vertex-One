import type { MetadataRoute } from "next";
import { URL_SITE } from "@/lib/seo";

/**
 * Bloque uniquement l'applicatif privé, la console interne et les liens à jeton à usage unique (jamais destinés à
 * être indexés, un jeton dans une URL indexée serait une fuite). Les pages publiques propres à une entreprise
 * cliente (/carrieres/[slug], /reserver/[slug], /p/[slug], /formulaire/[slug]) restent crawlables : ce sont leurs
 * propres pages publiques, l'indexation leur profite.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/app", "/api", "/portail", "/plateforme", "/invitation", "/devis", "/facture", "/signature", "/logo", "/abonnement-expire"],
    },
    sitemap: `${URL_SITE}/sitemap.xml`,
  };
}
