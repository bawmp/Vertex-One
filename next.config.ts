import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // One Invoicing, One Purchases et One Accounting sont désormais un seul module, One Books : les anciennes adresses du
  // site vitrine (déjà partagées ou indexées) redirigent définitivement vers la nouvelle page.
  async redirects() {
    return ["facturation", "achats", "comptabilite"].map((ancien) => ({ source: `/modules/${ancien}`, destination: "/modules/books", permanent: true }));
  },
  experimental: {
    serverActions: {
      // Défaut Next.js : 1 Mo — bien en dessous des limites déjà annoncées à
      // l'utilisateur pour les téléversements (CV 5 Mo, documents, One Form).
      // La vraie limite en production est celle de Vercel : 4,5 Mo de corps de
      // requête par fonction, d'où le plafond de 4 Mo appliqué par One Form
      // (src/lib/one-form/fichiers.ts).
      bodySizeLimit: "5mb",
    },
  },
};

export default nextConfig;
