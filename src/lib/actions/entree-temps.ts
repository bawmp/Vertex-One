"use server";

import { z } from "zod";
import { eq, and, isNull, inArray } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { avecEntreprise } from "@/db/client";
import { entreeTemps, projet, dossier, tache, facture, ligneFacture, entreprise } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { calculerMontants } from "@/lib/facturation/calcul";
import { genererNumeroFacture } from "@/lib/facturation/numerotation";
import { genererEcrituresFactureEmise } from "@/lib/comptabilite/ecritures";
import { resoudreClientVente } from "@/lib/facturation/client-document";

const schemaEntreeTemps = z.object({
  projetId: z.string(),
  tacheId: z.string().trim().optional(),
  date: z.string().min(1, "La date est requise."),
  dureeHeures: z.coerce.number().positive("La durée doit être positive."),
  tauxHoraire: z.coerce.number().int().nonnegative().default(0),
  facturable: z.string().optional(),
  note: z.string().trim().optional(),
});

export type EtatEntreeTemps = { erreur?: string } | null;

/**
 * Suivi des heures (échange du 2026-09-07) — aucun sélecteur "enregistré
 * par" : le créateur est toujours celui qui a travaillé les heures, même
 * simplification que les créations Achats/Ventes sans Deal.
 */
export async function creerEntreeTemps(_etat: EtatEntreeTemps, formData: FormData): Promise<EtatEntreeTemps> {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte.role, "PROJETS", "MODIFIER")) {
    return { erreur: "Vous n'avez pas le droit d'enregistrer des heures." };
  }

  const analyse = schemaEntreeTemps.safeParse({
    projetId: formData.get("projetId"),
    tacheId: formData.get("tacheId") || undefined,
    date: formData.get("date"),
    dureeHeures: formData.get("dureeHeures"),
    tauxHoraire: formData.get("tauxHoraire") || 0,
    facturable: formData.get("facturable") || undefined,
    note: formData.get("note") || undefined,
  });
  if (!analyse.success) {
    return { erreur: analyse.error.issues[0]?.message ?? "Formulaire invalide." };
  }
  const { projetId, tacheId, date, dureeHeures, tauxHoraire, facturable, note } = analyse.data;

  await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) =>
    tx.insert(entreeTemps).values({
      entrepriseId: utilisateurConnecte.entrepriseId,
      projetId,
      tacheId: tacheId || undefined,
      utilisateurId: utilisateurConnecte.utilisateurId,
      date: new Date(date),
      dureeHeures,
      tauxHoraire,
      facturable: facturable === "on",
      note: note || undefined,
    })
  );

  revalidatePath(`/app/projets/${projetId}`);
  revalidatePath("/app/projets/feuille-temps");
  return null;
}

/**
 * Une entrée déjà facturée (factureId renseigné) ne peut plus être
 * supprimée — la Facture elle-même n'est jamais modifiée après coup une
 * fois émise (voir CLAUDE.md).
 */
export async function supprimerEntreeTemps(entreeTempsId: string) {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte.role, "PROJETS", "MODIFIER")) return;

  const [entree] = await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) =>
    tx
      .delete(entreeTemps)
      .where(and(eq(entreeTemps.id, entreeTempsId), isNull(entreeTemps.factureId)))
      .returning({ projetId: entreeTemps.projetId })
  );

  if (entree) revalidatePath(`/app/projets/${entree.projetId}`);
  revalidatePath("/app/projets/feuille-temps");
}

/**
 * Génère une Facture à partir de TOUTES les entrées facturables non encore
 * facturées d'un Projet, en une fois — simplification connue, cohérente
 * avec le reste du produit (pas de sélection ligne par ligne, comme le
 * paiement partiel jamais implémenté ailleurs). Une ligne de Facture par
 * entrée (désignation = note, ou titre de la Tâche liée, ou générique).
 * Client retrouvé via projet.dossierId → dossier.contactId, faute de
 * contactId propre sur Projet — voir schema.ts.
 */
export async function genererFactureDepuisHeures(projetId: string) {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte.role, "FACTURATION", "CREER")) return;

  await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [leProjet] = await tx.select().from(projet).where(eq(projet.id, projetId));
    if (!leProjet) return;

    const [leDossier] = await tx.select().from(dossier).where(eq(dossier.id, leProjet.dossierId));
    if (!leDossier) return;

    const entrees = await tx
      .select()
      .from(entreeTemps)
      .where(and(eq(entreeTemps.projetId, projetId), eq(entreeTemps.facturable, true), isNull(entreeTemps.factureId)));
    if (entrees.length === 0) return;

    const [monEntreprise] = await tx.select({ niu: entreprise.niu }).from(entreprise).where(eq(entreprise.id, utilisateurConnecte.entrepriseId));
    if (!monEntreprise.niu) return;

    const client = await resoudreClientVente(tx, utilisateurConnecte, { contactId: leDossier.contactId });
    if (!client) return;

    const idsTaches = [...new Set(entrees.map((e) => e.tacheId).filter((id): id is string => id !== null))];
    const taches = idsTaches.length > 0 ? await tx.select({ id: tache.id, titre: tache.titre }).from(tache).where(inArray(tache.id, idsTaches)) : [];
    const titreTacheParId = new Map(taches.map((t) => [t.id, t.titre]));

    const lignes = entrees.map((e) => ({
      designation: e.note || (e.tacheId ? titreTacheParId.get(e.tacheId) : undefined) || `Heures travaillées — ${leProjet.titre}`,
      quantite: e.dureeHeures,
      prixUnitaire: e.tauxHoraire,
      tauxTVA: 19.25,
    }));
    const montants = calculerMontants(lignes);

    const numero = await genererNumeroFacture(tx, utilisateurConnecte.entrepriseId);
    const dateEcheance = new Date();
    dateEcheance.setDate(dateEcheance.getDate() + 30);

    const [nouvelleFacture] = await tx
      .insert(facture)
      .values({
        entrepriseId: utilisateurConnecte.entrepriseId,
        numero,
        contactId: client.contactId,
        compteId: client.compteId,
        assigneAId: client.assigneAId,
        montantHT: montants.montantHT,
        montantTVA: montants.montantTVA,
        montantTTC: montants.montantTTC,
        dateEcheance,
      })
      .returning({ id: facture.id });

    await tx.insert(ligneFacture).values(
      lignes.map((l) => ({
        entrepriseId: utilisateurConnecte.entrepriseId,
        factureId: nouvelleFacture.id,
        designation: l.designation,
        quantite: l.quantite,
        prixUnitaire: l.prixUnitaire,
        tauxTVA: l.tauxTVA,
      }))
    );

    await tx
      .update(entreeTemps)
      .set({ factureId: nouvelleFacture.id })
      .where(inArray(entreeTemps.id, entrees.map((e) => e.id)));

    await genererEcrituresFactureEmise(tx, {
      id: nouvelleFacture.id,
      entrepriseId: utilisateurConnecte.entrepriseId,
      numero,
      dateEmission: new Date(),
      montantHT: montants.montantHT,
      montantTVA: montants.montantTVA,
      montantTTC: montants.montantTTC,
    });
  });

  revalidatePath(`/app/projets/${projetId}`);
  revalidatePath("/app/facturation");
}
