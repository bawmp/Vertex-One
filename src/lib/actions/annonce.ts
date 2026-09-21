"use server";

import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { avecEntreprise } from "@/db/client";
import { annonce, pieceJointeAnnonce } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { effacerObjetStockage, televerserDocument } from "@/lib/documents/stockage";
import { nomFichierSain } from "@/lib/one-form/fichiers";
import { validerPiecesAnnonce } from "@/lib/annonces/pieces";

export type EtatAnnonce = { erreur?: string } | null;

/** Efface des objets R2 au mieux : un fichier orphelin est moins grave qu'une action qui échoue. */
async function effacerFichiers(cles: string[]): Promise<void> {
  for (const cle of cles) {
    try {
      await effacerObjetStockage(cle);
    } catch (erreur) {
      console.error(`[annonces] effacement R2 impossible pour ${cle} :`, erreur instanceof Error ? erreur.message : erreur);
    }
  }
}

/**
 * Portée toujours TOUT en lecture (docs/palier-3-*, section 7) — seule la création est réservée par rôle
 * (Manager/Administrateur), déjà vérifié par peut("ANNONCES", "CREER") : un Employé n'a pas cette action dans la matrice
 * (src/lib/permissions.ts).
 *
 * Une annonce est un texte, des pièces jointes (jusqu'à cinq : image, PDF, Word ou Excel, 4 Mo au total, type reconnu sur
 * les octets), ou les deux — jamais vide. Les fichiers sont validés avant tout envoi au stockage ; si l'enregistrement
 * échoue après le téléversement, les fichiers déjà envoyés sont effacés.
 */
export async function creerAnnonce(_etat: EtatAnnonce, formData: FormData): Promise<EtatAnnonce> {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte, "ANNONCES", "CREER")) {
    return { erreur: "Seuls les Managers et l'Administrateur peuvent publier une annonce." };
  }

  const contenu = String(formData.get("contenu") ?? "").trim();
  const verdict = await validerPiecesAnnonce(formData.getAll("fichiers"));
  if (!verdict.ok) return { erreur: verdict.erreur };
  if (!contenu && verdict.pieces.length === 0) return { erreur: "L'annonce ne peut pas être vide : écrivez un texte ou joignez un fichier." };

  const televerses: { cle: string; piece: (typeof verdict.pieces)[number] }[] = [];
  for (const piece of verdict.pieces) {
    const resultat = await televerserDocument({
      entrepriseId: utilisateurConnecte.entrepriseId,
      nomFichier: nomFichierSain(piece.nom, piece.extension),
      typeMime: piece.mime,
      contenu: piece.octets,
      dossier: "annonces",
    });
    if (!resultat.televerse) {
      await effacerFichiers(televerses.map((t) => t.cle));
      return { erreur: "Le stockage des fichiers n'est pas disponible pour le moment." };
    }
    televerses.push({ cle: resultat.cleStockage, piece });
  }

  try {
    await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
      const [cree] = await tx
        .insert(annonce)
        .values({ entrepriseId: utilisateurConnecte.entrepriseId, auteurId: utilisateurConnecte.utilisateurId, contenu })
        .returning({ id: annonce.id });
      if (televerses.length > 0) {
        await tx.insert(pieceJointeAnnonce).values(
          televerses.map((t) => ({ entrepriseId: utilisateurConnecte.entrepriseId, annonceId: cree.id, cleStockage: t.cle, nom: t.piece.nom, typeMime: t.piece.mime, tailleOctets: t.piece.taille }))
        );
      }
    });
  } catch (erreur) {
    await effacerFichiers(televerses.map((t) => t.cle));
    console.error("[annonces] publication impossible :", erreur instanceof Error ? erreur.message : erreur);
    return { erreur: "L'annonce n'a pas pu être publiée. Réessayez." };
  }

  revalidatePath("/app/annonces");
  revalidatePath("/app");
  return null;
}

export async function epinglerAnnonce(annonceId: string, epinglee: boolean) {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte, "ANNONCES", "MODIFIER")) return;

  await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) =>
    tx.update(annonce).set({ epinglee }).where(and(eq(annonce.id, annonceId), eq(annonce.entrepriseId, utilisateurConnecte.entrepriseId)))
  );

  revalidatePath("/app/annonces");
}

/** Supprime l'annonce, ses pièces jointes en base et leurs fichiers dans R2 (effacement réel). */
export async function supprimerAnnonce(annonceId: string) {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte, "ANNONCES", "SUPPRIMER")) return;

  const cles = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const pieces = await tx
      .select({ cle: pieceJointeAnnonce.cleStockage })
      .from(pieceJointeAnnonce)
      .where(and(eq(pieceJointeAnnonce.annonceId, annonceId), eq(pieceJointeAnnonce.entrepriseId, utilisateurConnecte.entrepriseId)));
    await tx.delete(pieceJointeAnnonce).where(and(eq(pieceJointeAnnonce.annonceId, annonceId), eq(pieceJointeAnnonce.entrepriseId, utilisateurConnecte.entrepriseId)));
    await tx.delete(annonce).where(and(eq(annonce.id, annonceId), eq(annonce.entrepriseId, utilisateurConnecte.entrepriseId)));
    return pieces.map((p) => p.cle);
  });
  await effacerFichiers(cles);

  revalidatePath("/app/annonces");
}
