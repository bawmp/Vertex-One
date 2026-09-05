import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

// Next.js 16 a renommé middleware.ts en proxy.ts — voir CLAUDE.md.
// Vérification légère (présence du cookie de session, pas d'appel base de
// données) pour rediriger vite ; la vérification complète (entrepriseId,
// role) se fait dans recupererUtilisateurConnecte() côté Server Component.
export function proxy(request: NextRequest) {
  const sessionCookie = getSessionCookie(request);

  if (!sessionCookie && request.nextUrl.pathname.startsWith("/app")) {
    return NextResponse.redirect(new URL("/connexion", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/app/:path*"],
};
