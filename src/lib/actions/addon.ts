"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq, and } from "drizzle-orm";
import { avecEntreprise } from "@/db/client";
import { addonActif } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import type { Addon } from "@/lib/plans";

// Prix indicatifs — docs/strategie-*, section 7 : "Modules complémentaires
// ... en options à l'unité". Aucune collecte de paiement réelle pour
// l'addon lui-même dans cette version (même simplification que le reste du
// produit avant l'intégration NotchPay/facturation complète des add-ons) —
// l'activation ADMIN suffit à débloquer la fonctionnalité, la facturation
// réelle du supplément reste à construire séparément.
const PRIX_ADDON: Record<Addon, number> = {
  MARKETING: 10_000,
  FACTURATION_ABONNEMENTS: 10_000,
  RESERVATIONS: 10_000,
};

export async function activerAddon(addon: Addon) {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (utilisateurConnecte.role !== "ADMIN") return;

  await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) =>
    tx
      .insert(addonActif)
      .values({ entrepriseId: utilisateurConnecte.entrepriseId, addon, prixMensuel: PRIX_ADDON[addon] })
      .onConflictDoNothing({ target: [addonActif.entrepriseId, addonActif.addon] })
  );

  revalidatePath("/app/marketing");
  revalidatePath("/app/reservations/parametres");
}

export async function desactiverAddon(addon: Addon) {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (utilisateurConnecte.role !== "ADMIN") return;

  await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) =>
    tx.delete(addonActif).where(and(eq(addonActif.entrepriseId, utilisateurConnecte.entrepriseId), eq(addonActif.addon, addon)))
  );

  revalidatePath("/app/marketing");
  revalidatePath("/app/reservations/parametres");
}
