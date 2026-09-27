"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { entreprise } from "@/db/schema";
import { auth } from "@/lib/auth";
import { EMAIL_DEMO, MOT_DE_PASSE_DEMO } from "@/lib/demo";

/**
 * "Voir la démo" (site vitrine) — connexion automatique au tenant public "Atelier Kalyss", même
 * mécanisme que creerEntreprise()/accepterInvitation() (Better-Auth server-side + redirect), jamais de
 * formulaire de mot de passe montré au visiteur. entreprise n'a pas de RLS (voir schema.ts) : la mise à
 * jour du compteur d'utilisations passe par un update direct, pas avecEntreprise().
 *
 * try/catch : contrairement aux deux appels existants (juste après la création du compte concerné), ce
 * bouton est exposé au public en continu — si le tenant démo venait à disparaître, un visiteur ne doit
 * jamais tomber sur une page d'erreur Next.js.
 */
export async function accederDemo() {
  try {
    const resultat = await auth.api.signInEmail({
      body: { email: EMAIL_DEMO, password: MOT_DE_PASSE_DEMO },
      headers: await headers(),
    });

    const entrepriseId = (resultat.user as { entrepriseId?: string }).entrepriseId;
    if (entrepriseId) {
      await db
        .update(entreprise)
        .set({ compteurUtilisationsDemo: sql`${entreprise.compteurUtilisationsDemo} + 1` })
        .where(eq(entreprise.id, entrepriseId));
    }
  } catch (erreur) {
    console.error("[demo] connexion automatique impossible :", erreur instanceof Error ? erreur.message : erreur);
    redirect("/");
  }

  redirect("/app");
}
