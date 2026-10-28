import type { MetadataRoute } from "next";

/**
 * Manifeste de l'application (installation sur l'écran d'accueil). Indispensable pour recevoir les notifications de One Chat
 * sur iPhone/iPad : Safari n'autorise le push que pour une application ajoutée à l'écran d'accueil. Sur Android et ordinateur,
 * il permet aussi d'installer Vertex One comme une application à part, qui s'ouvre directement sur l'espace de travail.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Vertex One",
    short_name: "Vertex One",
    description: "La suite de gestion pour entreprises de services.",
    start_url: "/app",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#233C7E",
    icons: [
      { src: "/marque/symbole.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon.png", sizes: "256x256", type: "image/png", purpose: "any" },
    ],
  };
}
