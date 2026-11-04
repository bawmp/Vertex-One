"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { avecEntreprise } from "@/db/client";
import { entreprise } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { disponible } from "@/lib/plans";
import { noterDeclarationTva } from "@/lib/comptabilite/declarations";
import { getT } from "@/lib/i18n/langue";
import { m } from "@/lib/i18n/catalogue";

export type EtatDeclaration = { erreur?: string; message?: string } | null;

/** Suivi des déclarations : Administrateur seul et forfait comptabilité complète, revérifiés ici. Le mois est contrôlé et l'échéance recalculée côté serveur. */
export async function noterDeclaration(periode: string, statut: string, montant: number | null, reference: string): Promise<EtatDeclaration> {
  return noter("TVA", periode, statut, montant, reference);
}

/** Même suivi pour l'acompte d'impôt sur les sociétés d'un mois (type distinct, mêmes contrôles et mêmes droits). */
export async function noterAcompteIS(periode: string, statut: string, montant: number | null, reference: string): Promise<EtatDeclaration> {
  return noter("ACOMPTE_IS", periode, statut, montant, reference);
}

async function noter(type: "TVA" | "ACOMPTE_IS", periode: string, statut: string, montant: number | null, reference: string): Promise<EtatDeclaration> {
  const t = await getT();
  const u = await recupererUtilisateurConnecte();
  if (!u) redirect("/connexion");
  if (!peut(u, "COMPTABILITE", "MODIFIER")) return { erreur: t("La comptabilité est réservée à l'Administrateur.") };
  const r = await avecEntreprise(u.entrepriseId, async (tx) => {
    const [e] = await tx.select({ planAbonnement: entreprise.planAbonnement, statutAbonnement: entreprise.statutAbonnement }).from(entreprise).where(eq(entreprise.id, u.entrepriseId));
    if (!disponible(e, "COMPTABILITE_COMPLETE")) return { ok: false, erreur: m("La comptabilité complète est disponible à partir du forfait Business.") } as const;
    return noterDeclarationTva(tx, u.entrepriseId, u.utilisateurId, { periode: String(periode), statut: String(statut), montant: montant === null ? null : Number(montant), reference: String(reference ?? "") }, type);
  });
  if (!r.ok) return { erreur: t(r.erreur) };
  revalidatePath("/app/comptabilite/declarations");
  return { message: t("Déclaration enregistrée.") };
}
