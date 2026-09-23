import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { EcranDemarrage } from "@/components/ecran-demarrage";
import { LangueProvider } from "@/lib/i18n/contexte";
import { langueVisiteur } from "@/lib/i18n/langue";
import { traduire } from "@/lib/i18n/traduire";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Vertex One",
  description: "La suite de gestion pour les entreprises de services au Cameroun.",
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
