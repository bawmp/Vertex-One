import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { EcranDemarrage } from "@/components/ecran-demarrage";
import { LangueProvider } from "@/lib/i18n/contexte";
import { langueVisiteur } from "@/lib/i18n/langue";
import { traduire } from "@/lib/i18n/traduire";
import { URL_SITE } from "@/lib/seo";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/**
 * metadataBase permet de résoudre les URLs relatives des images Open Graph/Twitter (voir src/lib/seo.ts) — sans
 * ça, Next.js les résout par rapport à l'URL de la requête, ce qui casse le partage sur les plateformes qui
 * récupèrent l'aperçu depuis un contexte différent (crawler sans hôte, prévisualisation locale...).
 *
 * Description volontairement centrée sur la conformité OHADA/SYSCOHADA (17 pays membres) et le Mobile Money — un
 * angle honnête de pertinence au-delà du Cameroun, plutôt qu'une prétention de présence dans plusieurs pays qui
 * n'est pas encore vraie (voir la section "Lancement honnête" de la page d'accueil, même principe ici).
 */
export const metadata: Metadata = {
  metadataBase: new URL(URL_SITE),
  title: { default: "Vertex One — Suite de gestion pour entreprises de services", template: "%s" },
  description:
    "La suite de gestion tout-en-un pour les entreprises de services : CRM, facturation, RH, projets et plus, avec Mobile Money natif et conformité OHADA/SYSCOHADA — pensée pour le Cameroun et les pays de la zone OHADA.",
  keywords: [
    "logiciel de gestion Cameroun",
    "CRM Afrique",
    "facturation Mobile Money",
    "logiciel OHADA",
    "logiciel SYSCOHADA",
    "ERP PME Afrique",
    "gestion entreprise services",
  ],
  robots: { index: true, follow: true },
  openGraph: {
    siteName: "Vertex One",
    locale: "fr_FR",
    type: "website",
  },
  twitter: { card: "summary_large_image" },
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Toujours la langue du VISITEUR (cookie, sinon navigateur) — jamais la préférence de compte ici, même connecté
  // (2026-09-23, bug réel corrigé : un visiteur connecté qui changeait de langue sur le site vitrine ou /connexion
  // voyait le cookie posé mais le contenu rester dans la langue de son compte, <html lang> ne pouvant être fixé
  // qu'une seule fois au tout premier niveau). /app et /portail imposent ensuite leur propre LangueProvider
  // (préférence de compte) plus bas dans l'arbre — voir src/app/app/layout.tsx et src/app/portail/layout.tsx.
  const langue = await langueVisiteur();
  return (
    <html
      lang={langue}
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/* attribute="class" pose/retire la classe "dark" sur <html> — le bloc
            CSS .dark existe déjà en entier dans globals.css (voir Tranche 1),
            rien à y changer. Noms de thème internes à next-themes
            (light/dark/system), volontairement distincts des valeurs stockées
            en base (clair/sombre/systeme) — la conversion se fait uniquement
            au point de contact (src/app/app/menu-utilisateur.tsx,
            src/app/app/mon-compte/page.tsx), jamais ici. */}
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <LangueProvider dictionnaire={traduire(langue)} langue={langue}>
            <EcranDemarrage />
            {children}
          </LangueProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
