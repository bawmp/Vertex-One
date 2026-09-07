import { eq, and, lte } from "drizzle-orm";
import type { TransactionDrizzle } from "@/db/client";
import { factureRecurrente, ligneFactureRecurrente, facture, ligneFacture, entreprise } from "@/db/schema";
import { genererNumeroFacture } from "@/lib/facturation/numerotation";
import { genererEcrituresFactureEmise } from "@/lib/comptabilite/ecritures";
import { decrementerStockVente } from "@/lib/produits/stock";

export type ResultatFactureRecurrente = {
  factureRecurrenteId: string;
  libelle: string;
  genere: boolean;
  factureId?: string;
  numero?: string;
  erreur?: string;
};

function prochaineDateApres(date: Date, frequence: "MENSUEL" | "TRIMESTRIEL" | "ANNUEL"): Date {
  const suivante = new Date(date);
  if (frequence === "MENSUEL") suivante.setMonth(suivante.getMonth() + 1);
  else if (frequence === "TRIMESTRIEL") suivante.setMonth(suivante.getMonth() + 3);
  else suivante.setFullYear(suivante.getFullYear() + 1);
  return suivante;
}

/**
 * Appelée quotidiennement par le worker (voir crontab,
 * verifier-factures-recurrentes.ts + facturer-recurrente-entreprise.ts,
 * même patron cron-dispatcher + job-par-entreprise que
 * src/lib/facturation/relance.ts). Génère une vraie Facture numérotée
 * (genererNumeroFacture(), même série que toute autre facture — un profil
 * récurrent n'a pas son propre numéro, ce n'est pas un document financier)
 * pour chaque modèle ACTIF dont l'échéance est atteinte, avance
 * prochaineDateGeneration à partir de la date prévue (jamais depuis "now",
 * pour ne jamais dériver si le worker tourne en retard un jour donné), et
 * bascule le statut à TERMINE une fois dateFin dépassée.
 *
 * Si le NIU de l'entreprise est manquant (même contrôle qu'à la création
 * d'un Devis/Bon de commande — docs/palier-1-*, section 2), la génération de
 * CE passage est sautée sans avancer prochaineDateGeneration : le prochain
 * passage quotidien retentera automatiquement une fois le NIU renseigné,
 * sans jamais perdre l'échéance.
 */
export async function genererFacturesRecurrentesDues(tx: TransactionDrizzle, entrepriseId: string): Promise<ResultatFactureRecurrente[]> {
  const dues = await tx
    .select()
    .from(factureRecurrente)
    .where(and(eq(factureRecurrente.entrepriseId, entrepriseId), eq(factureRecurrente.statut, "ACTIF"), lte(factureRecurrente.prochaineDateGeneration, new Date())));

  if (dues.length === 0) return [];

  const [monEntreprise] = await tx.select({ niu: entreprise.niu }).from(entreprise).where(eq(entreprise.id, entrepriseId));

  const resultats: ResultatFactureRecurrente[] = [];

  for (const profil of dues) {
    if (profil.dateFin && profil.prochaineDateGeneration > profil.dateFin) {
      await tx.update(factureRecurrente).set({ statut: "TERMINE" }).where(eq(factureRecurrente.id, profil.id));
      resultats.push({ factureRecurrenteId: profil.id, libelle: profil.libelle, genere: false, erreur: "Date de fin dépassée" });
      continue;
    }

    if (!monEntreprise.niu) {
      resultats.push({ factureRecurrenteId: profil.id, libelle: profil.libelle, genere: false, erreur: "NIU manquant" });
      continue;
    }

    const lignes = await tx.select().from(ligneFactureRecurrente).where(eq(ligneFactureRecurrente.factureRecurrenteId, profil.id));

    const numero = await genererNumeroFacture(tx, entrepriseId);
    const dateEcheance = new Date();
    dateEcheance.setDate(dateEcheance.getDate() + 30);

    const [nouvelleFacture] = await tx
      .insert(facture)
      .values({
        entrepriseId,
        numero,
        dealId: profil.dealId,
        contactId: profil.contactId,
        compteId: profil.compteId,
        assigneAId: profil.assigneAId,
        factureRecurrenteId: profil.id,
        montantHT: profil.montantHT,
        montantTVA: profil.montantTVA,
        montantTTC: profil.montantTTC,
        dateEcheance,
      })
      .returning({ id: facture.id });

    await tx.insert(ligneFacture).values(
      lignes.map((l) => ({
        entrepriseId,
        factureId: nouvelleFacture.id,
        produitId: l.produitId,
        designation: l.designation,
        quantite: l.quantite,
        prixUnitaire: l.prixUnitaire,
        tauxTVA: l.tauxTVA,
      }))
    );

    await decrementerStockVente(tx, lignes);

    await genererEcrituresFactureEmise(tx, {
      id: nouvelleFacture.id,
      entrepriseId,
      numero,
      dateEmission: new Date(),
      montantHT: profil.montantHT,
      montantTVA: profil.montantTVA,
      montantTTC: profil.montantTTC,
    });

    const prochaine = prochaineDateApres(profil.prochaineDateGeneration, profil.frequence);
    const termine = profil.dateFin != null && prochaine > profil.dateFin;

    await tx
      .update(factureRecurrente)
      .set({ prochaineDateGeneration: prochaine, statut: termine ? "TERMINE" : "ACTIF" })
      .where(eq(factureRecurrente.id, profil.id));

    resultats.push({ factureRecurrenteId: profil.id, libelle: profil.libelle, genere: true, factureId: nouvelleFacture.id, numero });
  }

  return resultats;
}
