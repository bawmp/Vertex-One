import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { EcranDemarrage } from "@/components/ecran-demarrage";
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

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="fr"
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
          <EcranDemarrage />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
