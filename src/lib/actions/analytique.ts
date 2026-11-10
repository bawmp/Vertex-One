"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { avecEntreprise } from "@/db/client";
import { contact, entreprise } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { disponible } from "@/lib/plans";
import { affecterDocument, creerSection, definirSectionContact, modifierSection } from "@/lib/comptabilite/analytique";
import { idsVisibles } from "@/lib/portee";
import { m } from "@/lib/i18n/catalogue";
import { getT } from "@/lib/i18n/langue";

export type EtatAnalytique = { erreur?: string; message?: string } | null;

/**
 * Comptabilité analytique. Réservée à l'Administrateur (comme toute la comptabilité) et au forfait comptabilité complète, revérifiés
 * ici. Les sections et les documents sont relus dans l'entreprise de la session : jamais un identifiant d'une autre.
 */
async function garde(action: "CREER" | "MODIFIER") {
  const t = await getT();
  const u = await recupererUtilisateurConnecte();
  if (!u) redirect("/connexion");
  if (!peut(u, "COMPTABILITE", action)) return { t, u, refus: t("La comptabilité est réservée à l'Administrateur.") };
  const ok = await avecEntreprise(u.entrepriseId, async (tx) => {
    const [e] = await tx.select({ planAbonnement: entreprise.planAbonnement, statutAbonnement: entreprise.statutAbonnement }).from(entreprise).where(eq(entreprise.id, u.entrepriseId));
    return disponible(e, "COMPTABILITE_COMPLETE");
  });
  if (!ok) return { t, u, refus: t("Votre abonnement est suspendu : renouvelez-le pour accéder à cette fonctionnalité.") };
  return { t, u, refus: null };
}

export async function creerSectionAnalytique(_etat: EtatAnalytique, formData: FormData): Promise<EtatAnalytique> {
  const { t, u, refus } = await garde("CREER");
  if (refus) return { erreur: refus };
  const r = await avecEntreprise(u.entrepriseId, (tx) => creerSection(tx, u.entrepriseId, { axe: String(formData.get("axe") ?? ""), code: String(formData.get("code") ?? ""), libelle: String(formData.get("libelle") ?? "") }));
  if (!r.ok) return { erreur: t(r.erreur) };
  revalidatePath("/app/comptabilite/analytique");
  return { message: t("Section créée.") };
}

export async function modifierSectionAnalytique(id: string, libelle: string, actif: boolean): Promise<EtatAnalytique> {
  const { t, u, refus } = await garde("MODIFIER");
  if (refus) return { erreur: refus };
  const r = await avecEntreprise(u.entrepriseId, (tx) => modifierSection(tx, u.entrepriseId, String(id), { libelle: String(libelle), actif: actif === true }));
  if (!r.ok) return { erreur: t(r.erreur) };
  revalidatePath("/app/comptabilite/analytique");
  return { message: t("Section enregistrée.") };
}

export async function affecterDocumentAnalytique(type: string, documentId: string, sectionId: string | null): Promise<EtatAnalytique> {
  const { t, u, refus } = await garde("MODIFIER");
  if (refus) return { erreur: refus };
  const r = await avecEntreprise(u.entrepriseId, (tx) => affecterDocument(tx, u.entrepriseId, String(type), String(documentId), sectionId ? String(sectionId) : null));
  if (!r.ok) return { erreur: t(r.erreur) };
  revalidatePath("/app/comptabilite/analytique");
  return { message: sectionId ? t("{n} écriture(s) rattachée(s) à la section.", { n: r.lignes }) : t("{n} écriture(s) détachée(s).", { n: r.lignes }) };
}

/** Section analytique par défaut d'un client : ses factures et reçus y seront rattachés. Droit comptable ET accès au contact (portée CRM), contact relu dans l'entreprise de la session. */
export async function definirSectionDuClient(contactId: string, sectionId: string | null): Promise<EtatAnalytique> {
  const { t, u, refus } = await garde("MODIFIER");
  if (refus) return { erreur: refus };
  const r = await avecEntreprise(u.entrepriseId, async (tx) => {
    const visibles = await idsVisibles(tx, u, "CRM");
    const [c] = await tx.select({ assigneAId: contact.assigneAId }).from(contact).where(and(eq(contact.id, String(contactId)), eq(contact.entrepriseId, u.entrepriseId)));
    if (!c || (visibles !== "TOUT" && !visibles.includes(c.assigneAId))) return { ok: false, erreur: m("Contact introuvable.") } as const;
    return definirSectionContact(tx, u.entrepriseId, String(contactId), sectionId ? String(sectionId) : null);
  });
  if (!r.ok) return { erreur: t(r.erreur) };
  revalidatePath(`/app/contacts/${contactId}`);
  return { message: t("Section du client enregistrée.") };
}
