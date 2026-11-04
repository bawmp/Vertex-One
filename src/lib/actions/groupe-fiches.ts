"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { avecEntreprise } from "@/db/client";
import { entreprise } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { disponible } from "@/lib/plans";
import { definirPartageFiches } from "@/lib/rh/groupe-fiches";

/**
 * Active ou coupe le partage des fiches collaborateur avec le groupe. Réservé à l'Administrateur (booléen strict, entreprise prise de la session). Le
 * partage n'a d'effet que si l'autre entreprise l'a activé aussi (voir src/lib/rh/groupe-fiches.ts).
 */
export async function definirPartageFichesAction(actif: boolean): Promise<{ erreur?: string }> {
  const u = await recupererUtilisateurConnecte();
  if (!u) redirect("/connexion");
  if (u.role !== "ADMIN" || !peut(u, "RH", "MODIFIER")) return { erreur: "Seul l'Administrateur peut régler le partage avec le groupe." };
  const ok = await avecEntreprise(u.entrepriseId, async (tx) => {
    const [e] = await tx.select({ planAbonnement: entreprise.planAbonnement, statutAbonnement: entreprise.statutAbonnement }).from(entreprise).where(eq(entreprise.id, u.entrepriseId));
    return Boolean(e) && disponible(e, "RH");
  });
  if (!ok) return { erreur: "Les Ressources Humaines sont disponibles à partir du forfait Business." };
  await definirPartageFiches(u.entrepriseId, actif === true);
  revalidatePath("/app/rh/groupe");
  revalidatePath("/app/rh");
  return {};
}
