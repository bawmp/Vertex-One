import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

// Next.js 16 a renommé middleware.ts en proxy.ts — voir CLAUDE.md.
// Vérification légère (présence du cookie de session, pas d'appel base de
// données) pour rediriger vite ; la vérification complète (entrepriseId,
// role) se fait dans recupererUtilisateurConnecte() côté Server Component.
export function proxy(request: NextRequest) {
  const sessionCookie = getSessionCookie(request);

  // Portail client (échange du 2026-09-13) — même vérification légère que
  // /app/* ; le rôle CLIENT lui-même est vérifié côté Server Component
  // (src/app/portail/layout.tsx), jamais ici.
  if (!sessionCookie && (request.nextUrl.pathname.startsWith("/app") || request.nextUrl.pathname.startsWith("/portail"))) {
    return NextResponse.redirect(new URL("/connexion", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/app/:path*", "/portail/:path*"],
};
