"use server";

import { z } from "zod";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { avecEntreprise } from "@/db/client";
import { entreprise, campagne } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { disponibleAddon } from "@/lib/plans";
import { resoudreSegment, type Segment } from "@/lib/marketing/segments";
import { envoyerEmail } from "@/lib/email/client";
import { envoyerWhatsApp } from "@/lib/whatsapp/client";

const schemaCampagne = z.object({
  nom: z.string().trim().min(2, "Le nom est requis."),
  canal: z.enum(["EMAIL", "WHATSAPP"]),
  contenu: z.string().trim().min(1, "Le contenu ne peut pas être vide."),
  segmentType: z.enum(["statut", "sansProjetDepuisJours"]),
  segmentValeur: z.string().trim().min(1, "Précisez le critère du segment."),
});

export type EtatCampagne = { erreur?: string } | null;

export async function creerCampagne(_etat: EtatCampagne, formData: FormData): Promise<EtatCampagne> {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte.role, "MARKETING", "CREER")) {
    return { erreur: "Vous n'avez pas le droit de créer une campagne." };
  }

  const analyse = schemaCampagne.safeParse({
    nom: formData.get("nom"),
    canal: formData.get("canal"),
    contenu: formData.get("contenu"),
    segmentType: formData.get("segmentType"),
    segmentValeur: formData.get("segmentValeur"),
  });
  if (!analyse.success) {
    return { erreur: analyse.error.issues[0]?.message ?? "Formulaire invalide." };
  }
  const { nom, canal, contenu, segmentType, segmentValeur } = analyse.data;

  const segment: Segment =
    segmentType === "statut" ? { statut: segmentValeur } : { sansProjetDepuisJours: Number(segmentValeur) || 0 };

  const resultat = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [monEntreprise] = await tx.select().from(entreprise).where(eq(entreprise.id, utilisateurConnecte.entrepriseId));
    if (!(await disponibleAddon(tx, monEntreprise, "MARKETING"))) {
      return { erreur: "Le module Marketing n'est pas activé pour votre entreprise." };
    }

    await tx.insert(campagne).values({ entrepriseId: utilisateurConnecte.entrepriseId, nom, canal, contenu, segment, creeParId: utilisateurConnecte.utilisateurId });
    return null;
  });

  if (resultat?.erreur) return resultat;

  revalidatePath("/app/marketing");
  return null;
}

export type EtatEnvoiCampagne = { erreur?: string; succes?: string } | null;

/**
 * Envoie réellement à chaque contact résolu par le segment — email via
 * Resend (déjà en place depuis le Palier 1), WhatsApp via
 * src/lib/whatsapp/client.ts (Palier 6, stub documenté tant que non
 * configuré). Marque la campagne ENVOYEE même si certains envois
 * individuels échouent — même principe que la relance de facture : l'échec
 * d'un canal externe non configuré n'est pas une erreur applicative.
 */
export async function envoyerCampagne(campagneId: string): Promise<EtatEnvoiCampagne> {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte.role, "MARKETING", "MODIFIER")) {
    return { erreur: "Vous n'avez pas le droit d'envoyer cette campagne." };
  }

  const resultat = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [laCampagne] = await tx.select().from(campagne).where(eq(campagne.id, campagneId));
    if (!laCampagne) return { erreur: "Campagne introuvable." };
    if (laCampagne.statut === "ENVOYEE") return { erreur: "Cette campagne a déjà été envoyée." };

    const contacts = await resoudreSegment(tx, utilisateurConnecte.entrepriseId, laCampagne.segment);
    if (contacts.length === 0) {
      return { erreur: "Aucun contact ne correspond à ce segment pour le moment." };
    }

    let envoyes = 0;
    for (const contact of contacts) {
      if (laCampagne.canal === "EMAIL") {
        if (!contact.email) continue;
        const { envoye } = await envoyerEmail({ to: contact.email, subject: laCampagne.nom, html: `<p>${laCampagne.contenu.replace(/\n/g, "</p><p>")}</p>` });
        if (envoye) envoyes++;
      } else {
        const { envoye } = await envoyerWhatsApp(contact.telephone, laCampagne.contenu);
        if (envoye) envoyes++;
      }
    }

    await tx.update(campagne).set({ statut: "ENVOYEE", envoyeeLe: new Date() }).where(eq(campagne.id, campagneId));

    return { succes: `Campagne envoyée à ${envoyes}/${contacts.length} contact(s).` };
  });

  revalidatePath("/app/marketing");
  return resultat;
}
