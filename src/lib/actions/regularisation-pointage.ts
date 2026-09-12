"use server";

import { z } from "zod";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { avecEntreprise } from "@/db/client";
import { entreprise, dossierRH, regularisationPointage } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut, portee } from "@/lib/permissions";
import { disponible } from "@/lib/plans";
import { idsVisibles } from "@/lib/portee";
import { debutJournee } from "@/lib/rh/pointage";
import { approuverRegularisation, refuserRegularisation } from "@/lib/rh/regularisation";

const schemaRegularisation = z.object({
  date: z.string().min(1, "La date est requise."),
  heureArriveeProposee: z.string().optional(),
  heureDepartProposee: z.string().optional(),
  motif: z.string().trim().min(1, "Le motif est requis."),
});

export type EtatRegularisation = { erreur?: string } | null;

/**
 * Toujours pour son propre Dossier RH, jamais un dossierRHId envoyé par le
 * client — même choix que creerDemandeConge() (src/lib/actions/rh.ts).
 */
export async function creerRegularisation(_etat: EtatRegularisation, formData: FormData): Promise<EtatRegularisation> {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte.role, "RH", "CREER")) {
    return { erreur: "Vous n'avez pas le droit de demander une régularisation." };
  }

  const analyse = schemaRegularisation.safeParse({
    date: formData.get("date"),
    heureArriveeProposee: formData.get("heureArriveeProposee") || undefined,
    heureDepartProposee: formData.get("heureDepartProposee") || undefined,
    motif: formData.get("motif"),
  });
  if (!analyse.success) {
    return { erreur: analyse.error.issues[0]?.message ?? "Formulaire invalide." };
  }
  const { date, heureArriveeProposee, heureDepartProposee, motif } = analyse.data;
  if (!heureArriveeProposee && !heureDepartProposee) {
    return { erreur: "Proposez au moins une heure d'arrivée ou de départ." };
  }

  const dateJour = debutJournee(new Date(date));
  if (dateJour.getTime() > debutJournee(new Date()).getTime()) {
    return { erreur: "Impossible de régulariser une date future." };
  }

  const resultat = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [monEntreprise] = await tx.select().from(entreprise).where(eq(entreprise.id, utilisateurConnecte.entrepriseId));
    if (!disponible(monEntreprise, "RH")) return { erreur: "Les Ressources Humaines sont disponibles à partir du forfait Business." };

    const [monDossier] = await tx.select({ id: dossierRH.id }).from(dossierRH).where(eq(dossierRH.utilisateurId, utilisateurConnecte.utilisateurId));
    if (!monDossier) return { erreur: "Aucun dossier RH associé à votre compte." };

    // "heure" saisie en HH:MM (input type="time") — combinée avec la date
    // du jour concerné, jamais la date système du moment de la demande.
    const combiner = (heure: string | undefined) => {
      if (!heure) return undefined;
      const [h, m] = heure.split(":").map(Number);
      const d = new Date(dateJour);
      d.setHours(h, m, 0, 0);
      return d;
    };

    await tx.insert(regularisationPointage).values({
      entrepriseId: utilisateurConnecte.entrepriseId,
      dossierRHId: monDossier.id,
      date: dateJour,
      heureArriveeProposee: combiner(heureArriveeProposee),
      heureDepartProposee: combiner(heureDepartProposee),
      motif,
    });

    return null;
  });

  if (resultat?.erreur) return resultat;

  revalidatePath("/app/rh");
  return null;
}

/**
 * Même garde de portée que traiterDemandeConge() : vérifie que le dossier
 * concerné est bien dans la portée de qui approuve.
 */
export async function traiterRegularisation(regularisationId: string, decision: "approuver" | "refuser") {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte.role, "RH", "MODIFIER")) return;

  await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [demande] = await tx.select().from(regularisationPointage).where(eq(regularisationPointage.id, regularisationId));
    if (!demande) return;

    const [leDossier] = await tx.select({ utilisateurId: dossierRH.utilisateurId }).from(dossierRH).where(eq(dossierRH.id, demande.dossierRHId));
    if (!leDossier) return;

    if (portee(utilisateurConnecte.role, "RH") !== "TOUT") {
      const ids = await idsVisibles(tx, utilisateurConnecte, "RH");
      if (ids !== "TOUT" && !ids.includes(leDossier.utilisateurId)) return;
    }

    if (decision === "approuver") {
      await approuverRegularisation(tx, regularisationId, utilisateurConnecte.utilisateurId);
    } else {
      await refuserRegularisation(tx, regularisationId, utilisateurConnecte.utilisateurId);
    }
  });

  revalidatePath("/app/rh");
}
