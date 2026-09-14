import { createAuthClient } from "better-auth/react";
import { inferAdditionalFields } from "better-auth/client/plugins";
import type { auth } from "@/lib/auth";

// inferAdditionalFields<typeof auth>() type uniquement le client sur les
// additionalFields déjà déclarés côté serveur (src/lib/auth.ts) — aucun
// appel réseau supplémentaire, seulement pour que authClient.updateUser({
// langue })/{ theme }/{ ordreModules } soit correctement typé plutôt que de
// recourir à un cast "as never" à chaque appel.
export const authClient = createAuthClient({
  plugins: [inferAdditionalFields<typeof auth>()],
});
