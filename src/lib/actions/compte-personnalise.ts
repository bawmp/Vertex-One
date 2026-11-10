"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { avecEntreprise } from "@/db/client";
import { entreprise } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { disponible } from "@/lib/plans";
import { creerComptePersonnalise, renommerComptePersonnalise, supprimerComptePersonnalise, type ResultatCompte } from "@/lib/comptabilite/comptes-personnalises";
import { getT } from "@/lib/i18n/langue";
import { m } from "@/lib/i18n/catalogue";

export type EtatCompte = { erreur?: string; message?: string } | null;

/** Droit et forfait revérifiés à chaque appel : la page seule ne suffit jamais. */
async function autoriser(action: "CREER" | "MODIFIER" | "SUPPRIMER") {
  const t = await getT();
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte, "COMPTABILITE", action)) return { t, refus: t("Vous n'avez pas le droit de modifier le plan comptable.") } as const;
  return { t, utilisateurConnecte } as const;
}

async function executer(action: "CREER" | "MODIFIER" | "SUPPRIMER", travail: (tx: Parameters<Parameters<typeof avecEntreprise>[1]>[0], entrepriseId: string) => Promise<ResultatCompte>, succes: string): Promise<EtatCompte> {
  const a = await autoriser(action);
  if ("refus" in a) return { erreur: a.refus };
  const { t, utilisateurConnecte } = a;
  const resultat = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [monEntreprise] = await tx.select({ planAbonnement: entreprise.planAbonnement, statutAbonnement: entreprise.statutAbonnement }).from(entreprise).where(eq(entreprise.id, utilisateurConnecte.entrepriseId));
    if (!disponible(monEntreprise, "COMPTABILITE_COMPLETE")) return { ok: false, erreur: m("Votre abonnement est suspendu : renouvelez-le pour accéder à cette fonctionnalité.") } as ResultatCompte;
    return travail(tx, utilisateurConnecte.entrepriseId);
  });
  if (!resultat.ok) return { erreur: t(resultat.erreur) };
  revalidatePath("/app/comptabilite/plan-comptable");
  return { message: t(succes) };
}

export async function ajouterComptePersonnalise(_etat: EtatCompte, formData: FormData): Promise<EtatCompte> {
  const numero = String(formData.get("numero") ?? "").trim();
  const libelle = String(formData.get("libelle") ?? "");
  return executer("CREER", (tx, entrepriseId) => creerComptePersonnalise(tx, entrepriseId, numero, libelle), m("Compte ajouté au plan comptable."));
}

export async function renommerCompte(compteId: string, _etat: EtatCompte, formData: FormData): Promise<EtatCompte> {
  const libelle = String(formData.get("libelle") ?? "");
  return executer("MODIFIER", (tx, entrepriseId) => renommerComptePersonnalise(tx, entrepriseId, compteId, libelle), m("Intitulé modifié."));
}

export async function supprimerCompte(compteId: string): Promise<EtatCompte> {
  return executer("SUPPRIMER", (tx, entrepriseId) => supprimerComptePersonnalise(tx, entrepriseId, compteId), m("Compte supprimé."));
}
