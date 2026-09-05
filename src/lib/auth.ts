import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { db } from "@/db/client";
import * as schema from "@/db/schema";

// Better-Auth gère session/cookies/CSRF/hachage — mappé sur notre table
// utilisateur existante plutôt que de laisser Better-Auth créer son propre
// modèle "user". Voir docs/palier-0-*, section 8, et CLAUDE.md.
export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      ...schema,
      user: schema.utilisateur,
      session: schema.session,
      account: schema.compte,
      verification: schema.verification,
    },
  }),
  emailAndPassword: {
    enabled: true,
    // La création de compte ne passe jamais par l'endpoint public de
    // Better-Auth : entrepriseId/role sont en input:false (voir plus bas),
    // donc un client ne peut de toute façon pas se les attribuer via cet
    // endpoint — on le désactive complètement pour ne garder qu'un seul
    // chemin de création de compte, nos propres Server Actions
    // (src/lib/actions), qui insèrent directement utilisateur+account.
    disableSignUp: true,
  },
  user: {
    // Champs "core" Better-Auth mappés sur nos colonnes françaises — email et
    // image ont le même nom des deux côtés, omis volontairement (bug connu
    // du mapping "fields" avec l'adapter Drizzle quand fieldName == nom déjà
    // identique, voir CLAUDE.md).
    fields: {
      name: "nomComplet",
      emailVerified: "emailVerifie",
      createdAt: "creeLe",
      updatedAt: "misAJourLe",
    },
    // Ces colonnes existent sur notre table "utilisateur" mais ne font pas
    // partie du modèle Better-Auth par défaut.
    additionalFields: {
      entrepriseId: { type: "string", required: true, input: false },
      role: { type: "string", required: true, defaultValue: "EMPLOYE", input: false },
      statut: { type: "string", required: true, defaultValue: "ACTIF", input: false },
      managerId: { type: "string", required: false },
    },
  },
  // Doit rester le dernier plugin : permet aux Server Actions de poser les
  // cookies de session (nécessaire au-delà des Route Handlers classiques).
  plugins: [nextCookies()],
});
