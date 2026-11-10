"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { avecEntreprise } from "@/db/client";
import { entreprise } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { disponible } from "@/lib/plans";
import { getT } from "@/lib/i18n/langue";

/** Active ou coupe l'email « Joyeux anniversaire » envoyé à la personne le jour de son anniversaire. Administrateur seul, booléen strict, entreprise de la session. */
export async function definirSouhaitAnniversaireAction(actif: boolean): Promise<{ erreur?: string }> {
  const t = await getT();
  const u = await recupererUtilisateurConnecte();
  if (!u) redirect("/connexion");
  if (u.role !== "ADMIN" || !peut(u, "RH", "MODIFIER")) return { erreur: t("Seul l'Administrateur peut régler ce message.") };
  const ok = await avecEntreprise(u.entrepriseId, async (tx) => {
    const [e] = await tx.select({ planAbonnement: entreprise.planAbonnement, statutAbonnement: entreprise.statutAbonnement }).from(entreprise).where(eq(entreprise.id, u.entrepriseId));
    if (!e || !disponible(e, "RH")) return false;
    await tx.update(entreprise).set({ souhaitAnniversaireEmail: actif === true }).where(eq(entreprise.id, u.entrepriseId));
    return true;
  });
  if (!ok) return { erreur: t("Votre abonnement est suspendu : renouvelez-le pour accéder à cette fonctionnalité.") };
  revalidatePath("/app/rh");
  return {};
}
