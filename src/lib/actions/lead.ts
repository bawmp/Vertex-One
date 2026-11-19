"use server";

import { z } from "zod";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { avecEntreprise } from "@/db/client";
import { lead, statutLead } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { idsVisibles } from "@/lib/portee";
import { getT } from "@/lib/i18n/langue";
import { m } from "@/lib/i18n/catalogue";

const schemaLead = z.object({
  nom: z.string().trim().min(2, m("Le nom est trop court.")),
  societeCliente: z.string().trim().optional(),
  telephone: z.string().trim().min(6, m("Numéro de téléphone invalide.")),
  email: z.email().optional().or(z.literal("")),
  notes: z.string().trim().optional(),
});

export type EtatLead = { erreur?: string } | null;

/**
 * Assigné à son créateur par défaut (même principe que l'ancien Prospect
 * unique, docs/palier-1-*, section 6, étape 1).
 */
export async function creerLead(_etat: EtatLead, formData: FormData): Promise<EtatLead> {
  const t = await getT();
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte, "CRM", "CREER")) {
    return { erreur: t("Vous n'avez pas le droit de créer un lead.") };
  }

  const analyse = schemaLead.safeParse({
    nom: formData.get("nom"),
    societeCliente: formData.get("societeCliente") || undefined,
    telephone: formData.get("telephone"),
    email: formData.get("email") || "",
    notes: formData.get("notes") || undefined,
  });
  if (!analyse.success) {
    return { erreur: t(analyse.error.issues[0]?.message ?? m("Formulaire invalide.")) };
  }
  const { nom, societeCliente, telephone, email, notes } = analyse.data;

  const [nouveauLead] = await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) =>
    tx
      .insert(lead)
      .values({ entrepriseId: utilisateurConnecte.entrepriseId, nom, societeCliente, telephone, email: email || undefined, notes, assigneAId: utilisateurConnecte.utilisateurId })
      .returning({ id: lead.id })
  );

  revalidatePath("/app/leads");
  redirect(`/app/leads/${nouveauLead.id}`);
}

export async function changerStatutLead(leadId: string, statut: (typeof statutLead.enumValues)[number]) {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte, "CRM", "MODIFIER")) return;

  await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    // Le lead est relu avec la portée CRM de la personne connectée : un identifiant reçu du navigateur ne suffit jamais. Un lead déjà devenu client ne change plus de statut.
    const [ligne] = await tx.select().from(lead).where(eq(lead.id, leadId));
    if (!ligne || ligne.convertiLe) return;
    const visibles = await idsVisibles(tx, utilisateurConnecte, "CRM");
    if (visibles !== "TOUT" && !visibles.includes(ligne.assigneAId)) return;
    // `qualifieLe` = le jour où le lead est devenu prospect qualifié (il apparaît alors dans « Prospects qualifiés ») ; il se vide si le lead quitte ce statut.
    const qualifieLe = statut === "QUALIFIE" ? (ligne.qualifieLe ?? new Date()) : null;
    // Un lead qui (re)devient prospect qualifié repart d'une séquence de relance automatique vierge.
    const nouvellementQualifie = statut === "QUALIFIE" && !ligne.qualifieLe;
    await tx
      .update(lead)
      .set({ statut, qualifieLe, ...(nouvellementQualifie ? { sequenceEtape: 0, sequenceDerniereLe: null, sequenceArreteeLe: null, sequenceArretMotif: null } : {}) })
      .where(eq(lead.id, leadId));
  });

  revalidatePath(`/app/leads/${leadId}`);
  revalidatePath("/app/leads");
  revalidatePath("/app/prospects");
}

export async function modifierNotesLead(leadId: string, notes: string) {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte, "CRM", "MODIFIER")) return;

  await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) => tx.update(lead).set({ notes: notes || null }).where(eq(lead.id, leadId)));

  revalidatePath(`/app/leads/${leadId}`);
}

// La conversion d'un lead en Contact/Deal (Zoho : « Once the lead is qualified, you can convert the lead into a Contact, Account, and Deal »)
// passe désormais UNIQUEMENT par « Devenir client » (`devenirClient`, src/lib/actions/prospect.ts) : réservée à un prospect qualifié, avec la portée CRM
// vérifiée. Il n'y a plus de raccourci qui crée un Contact depuis un lead non qualifié.
