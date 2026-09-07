"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { avecEntreprise } from "@/db/client";
import { journalManuel, ecritureComptable, entreprise } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { genererNumeroJournalManuel } from "@/lib/facturation/numerotation";
import { verifierDateNonVerrouillee } from "@/lib/comptabilite/verrouillage";

const schemaLigne = z.object({
  compteId: z.string().min(1, "Chaque ligne doit avoir un compte."),
  debit: z.coerce.number().int().nonnegative(),
  credit: z.coerce.number().int().nonnegative(),
});

const schemaJournalManuel = z.object({
  date: z.string().min(1, "La date est requise."),
  libelle: z.string().trim().min(1, "Le libellé est requis."),
  lignes: z.array(schemaLigne).min(2, "Un journal manuel doit avoir au moins deux lignes."),
});

export type EtatJournalManuel = { erreur?: string } | null;

/**
 * Journaux manuels (Zoho Books > Comptable, échange du 2026-09-07) — la
 * seule façon de ce produit d'écrire dans ecritureComptable sans passer par
 * une Facture/Dépense/Paiement (voir src/lib/comptabilite/ecritures.ts pour
 * ces cas-là). Équilibre débit = crédit imposé ici, jamais laissé à la
 * responsabilité de l'appelant — un journal déséquilibré ne doit jamais
 * pouvoir être enregistré.
 */
export async function creerJournalManuel(_etat: EtatJournalManuel, formData: FormData): Promise<EtatJournalManuel> {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte.role, "COMPTABILITE", "CREER")) {
    return { erreur: "Vous n'avez pas le droit de créer un journal manuel." };
  }

  const comptesId = formData.getAll("compteId").map(String);
  const debits = formData.getAll("debit").map(String);
  const credits = formData.getAll("credit").map(String);
  const lignesBrutes = comptesId.map((compteId, i) => ({ compteId, debit: debits[i] ?? "0", credit: credits[i] ?? "0" }));

  const analyse = schemaJournalManuel.safeParse({
    date: formData.get("date"),
    libelle: formData.get("libelle"),
    lignes: lignesBrutes,
  });
  if (!analyse.success) {
    return { erreur: analyse.error.issues[0]?.message ?? "Formulaire invalide." };
  }
  const { date, libelle, lignes } = analyse.data;

  for (const ligne of lignes) {
    const uneSeuleColonne = (ligne.debit > 0 && ligne.credit === 0) || (ligne.credit > 0 && ligne.debit === 0);
    if (!uneSeuleColonne) {
      return { erreur: "Chaque ligne doit porter un débit OU un crédit, jamais les deux ni aucun." };
    }
  }

  const totalDebit = lignes.reduce((s, l) => s + l.debit, 0);
  const totalCredit = lignes.reduce((s, l) => s + l.credit, 0);
  if (totalDebit !== totalCredit) {
    return { erreur: `Le journal n'est pas équilibré : débit ${totalDebit} ≠ crédit ${totalCredit}.` };
  }
  if (totalDebit === 0) {
    return { erreur: "Le montant total doit être positif." };
  }

  const erreurVerrouillage = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [monEntreprise] = await tx.select({ dateVerrouillageComptable: entreprise.dateVerrouillageComptable }).from(entreprise).where(eq(entreprise.id, utilisateurConnecte.entrepriseId));
    return verifierDateNonVerrouillee(monEntreprise?.dateVerrouillageComptable ?? null, new Date(date));
  });
  if (erreurVerrouillage) return { erreur: erreurVerrouillage };

  await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    // Insertion directe dans ecritureComptable (pas via creerEcritures(),
    // qui suppose une écriture générée par un document Ventes/Achats) — la
    // garde de verrouillage a donc dû être vérifiée explicitement ci-dessus,
    // ce chemin ne passe jamais par le point de contrôle centralisé.
    const numero = await genererNumeroJournalManuel(tx, utilisateurConnecte.entrepriseId);
    const dateEcriture = new Date(date);

    const [leJournal] = await tx
      .insert(journalManuel)
      .values({ entrepriseId: utilisateurConnecte.entrepriseId, numero, libelle, dateEcriture, creeParId: utilisateurConnecte.utilisateurId })
      .returning({ id: journalManuel.id });

    await tx.insert(ecritureComptable).values(
      lignes.map((l) => ({
        entrepriseId: utilisateurConnecte.entrepriseId,
        dateEcriture,
        libelle,
        compteId: l.compteId,
        debit: l.debit,
        credit: l.credit,
        journalManuelId: leJournal.id,
      }))
    );
  });

  revalidatePath("/app/comptabilite/journaux-manuels");
  revalidatePath("/app/comptabilite");
  return null;
}
