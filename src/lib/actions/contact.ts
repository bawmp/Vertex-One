"use server";

import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { avecEntreprise } from "@/db/client";
import { contact, interaction, contactChampValeur } from "@/db/schema";
import { listerChampsPersonnalisesContact } from "@/lib/actions/champ-personnalise-contact";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { genererLienVisio } from "@/lib/marketing/visio";
import { getT } from "@/lib/i18n/langue";
import { m } from "@/lib/i18n/catalogue";

const schemaContact = z.object({
  nom: z.string().trim().min(2, m("Le nom est trop court.")),
  compteId: z.string().trim().optional(),
  fonction: z.string().trim().optional(),
  telephone: z.string().trim().min(6, m("Numéro de téléphone invalide.")),
  email: z.email().optional().or(z.literal("")),
  notes: z.string().trim().optional(),
});

export type EtatContact = { erreur?: string } | null;

/**
 * Création directe d'un Contact, sans passer par un Lead — pour un client
 * déjà connu (docs de référence Zoho CRM : les Contacts peuvent aussi être
 * créés directement, pas uniquement par conversion).
 */
export async function creerContact(_etat: EtatContact, formData: FormData): Promise<EtatContact> {
  const t = await getT();
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte, "CRM", "CREER")) {
    return { erreur: t("Vous n'avez pas le droit de créer un contact.") };
  }

  const analyse = schemaContact.safeParse({
    nom: formData.get("nom"),
    compteId: formData.get("compteId") || undefined,
    fonction: formData.get("fonction") || undefined,
    telephone: formData.get("telephone"),
    email: formData.get("email") || "",
    notes: formData.get("notes") || undefined,
  });
  if (!analyse.success) {
    return { erreur: t(analyse.error.issues[0]?.message ?? m("Formulaire invalide.")) };
  }
  const { nom, compteId, fonction, telephone, email, notes } = analyse.data;

  let nouveauContactId = "";
  const erreurChampPersonnalise = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const champs = await listerChampsPersonnalisesContact(utilisateurConnecte.entrepriseId, tx);
    const valeurs: { champId: string; valeur: string }[] = [];
    for (const champ of champs) {
      const brut = formData.get(`champ_${champ.id}`);
      const valeur = typeof brut === "string" ? brut.trim() : "";
      if (!valeur) {
        if (champ.obligatoire) return t('Le champ "{libelle}" est obligatoire.', { libelle: champ.libelle });
        continue;
      }
      valeurs.push({ champId: champ.id, valeur: champ.type === "CASE_A_COCHER" ? "oui" : valeur });
    }

    const [cree] = await tx
      .insert(contact)
      .values({
        entrepriseId: utilisateurConnecte.entrepriseId,
        nom,
        compteId: compteId || undefined,
        fonction,
        telephone,
        email: email || undefined,
        notes,
        assigneAId: utilisateurConnecte.utilisateurId,
      })
      .returning({ id: contact.id });

    if (valeurs.length > 0) {
      await tx.insert(contactChampValeur).values(valeurs.map((v) => ({ entrepriseId: utilisateurConnecte.entrepriseId, contactId: cree.id, champId: v.champId, valeur: v.valeur })));
    }
    nouveauContactId = cree.id;
    return null;
  });
  if (erreurChampPersonnalise) return { erreur: erreurChampPersonnalise };

  revalidatePath("/app/contacts");
  redirect(`/app/contacts/${nouveauContactId}`);
}

const schemaInteraction = z.object({
  contactId: z.string(),
  type: z.enum(["appel", "whatsapp", "email", "rendez-vous", "note"]),
  contenu: z.string().trim().min(1, m("Le contenu ne peut pas être vide.")),
});

export type EtatInteraction = { erreur?: string } | null;

export async function ajouterInteraction(_etat: EtatInteraction, formData: FormData): Promise<EtatInteraction> {
  const t = await getT();
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte, "CRM", "MODIFIER")) {
    return { erreur: t("Vous n'avez pas le droit d'ajouter une interaction.") };
  }

  const analyse = schemaInteraction.safeParse({
    contactId: formData.get("contactId"),
    type: formData.get("type"),
    contenu: formData.get("contenu"),
  });
  if (!analyse.success) {
    return { erreur: t(analyse.error.issues[0]?.message ?? m("Formulaire invalide.")) };
  }
  const { contactId, type, contenu } = analyse.data;

  await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) =>
    tx.insert(interaction).values({ entrepriseId: utilisateurConnecte.entrepriseId, contactId, type, contenu, auteurId: utilisateurConnecte.utilisateurId })
  );

  revalidatePath(`/app/contacts/${contactId}`);
  return null;
}

/**
 * Docs/palier-6-*, section 4 — génère un lien Jitsi et l'enregistre
 * directement comme une Interaction de type "rendez-vous".
 */
export async function genererEtEnregistrerLienVisio(contactId: string) {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte, "CRM", "MODIFIER")) return;

  const lien = genererLienVisio(utilisateurConnecte.entrepriseId, contactId);

  await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) =>
    tx.insert(interaction).values({ entrepriseId: utilisateurConnecte.entrepriseId, contactId, type: "rendez-vous", contenu: lien, auteurId: utilisateurConnecte.utilisateurId })
  );

  revalidatePath(`/app/contacts/${contactId}`);
}

export async function modifierNotesContact(contactId: string, notes: string) {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte, "CRM", "MODIFIER")) return;

  await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) => tx.update(contact).set({ notes: notes || null }).where(eq(contact.id, contactId)));

  revalidatePath(`/app/contacts/${contactId}`);
}

/**
 * Remplace les valeurs des champs personnalisés d'un Contact — upsert sur
 * (contactId, champId) (contrainte unique, voir schema.ts), et supprime la
 * ligne d'un champ vidé plutôt que d'y laisser une valeur vide.
 */
export async function modifierValeursChampsPersonnalisesContact(contactId: string, _etat: EtatContact, formData: FormData): Promise<EtatContact> {
  const t = await getT();
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte, "CRM", "MODIFIER")) {
    return { erreur: t("Vous n'avez pas le droit de modifier ce contact.") };
  }

  const erreur = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const champs = await listerChampsPersonnalisesContact(utilisateurConnecte.entrepriseId, tx);
    for (const champ of champs) {
      const brut = formData.get(`champ_${champ.id}`);
      const valeur = typeof brut === "string" ? brut.trim() : "";
      if (!valeur) {
        if (champ.obligatoire) return t('Le champ "{libelle}" est obligatoire.', { libelle: champ.libelle });
        await tx.delete(contactChampValeur).where(and(eq(contactChampValeur.contactId, contactId), eq(contactChampValeur.champId, champ.id)));
        continue;
      }
      await tx
        .insert(contactChampValeur)
        .values({ entrepriseId: utilisateurConnecte.entrepriseId, contactId, champId: champ.id, valeur: champ.type === "CASE_A_COCHER" ? "oui" : valeur })
        .onConflictDoUpdate({ target: [contactChampValeur.contactId, contactChampValeur.champId], set: { valeur: champ.type === "CASE_A_COCHER" ? "oui" : valeur } });
    }
    return null;
  });
  if (erreur) return { erreur };

  revalidatePath(`/app/contacts/${contactId}`);
  return null;
}
