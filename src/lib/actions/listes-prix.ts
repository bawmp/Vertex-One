"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { avecEntreprise } from "@/db/client";
import { contact } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { idsVisibles } from "@/lib/portee";
import { affecterListeAuContact, creerListe, definirPrixFixe, modifierListe, supprimerListe } from "@/lib/produits/listes-prix";
import { getT } from "@/lib/i18n/langue";
import { m } from "@/lib/i18n/catalogue";

export type EtatListePrix = { erreur?: string; message?: string } | null;

/**
 * Listes de prix. Les créer, les modifier et fixer leurs prix = modifier le catalogue : droit « modifier » sur les produits. Rattacher une
 * liste à un client = modifier ce contact (droit CRM + portée de l'utilisateur). Listes, produits et contacts sont relus dans l'entreprise de
 * la session ; rien du navigateur n'est cru tel quel.
 */
async function garde() {
  const t = await getT();
  const u = await recupererUtilisateurConnecte();
  if (!u) redirect("/connexion");
  if (!peut(u, "PRODUITS", "MODIFIER")) return { t, u, refus: t("Vous n'avez pas le droit de modifier les produits.") };
  return { t, u, refus: null };
}

export async function creerListePrixAction(_etat: EtatListePrix, formData: FormData): Promise<EtatListePrix> {
  const { t, u, refus } = await garde();
  if (refus) return { erreur: refus };
  const r = await avecEntreprise(u.entrepriseId, (tx) => creerListe(tx, u.entrepriseId, { nom: String(formData.get("nom") ?? ""), remisePourcent: Number(formData.get("remisePourcent") || 0) }));
  if (!r.ok) return { erreur: t(r.erreur) };
  revalidatePath("/app/produits/listes-prix");
  redirect(`/app/produits/listes-prix/${r.id}`);
}

export async function modifierListePrixAction(listeId: string, _etat: EtatListePrix, formData: FormData): Promise<EtatListePrix> {
  const { t, u, refus } = await garde();
  if (refus) return { erreur: refus };
  const r = await avecEntreprise(u.entrepriseId, (tx) => modifierListe(tx, u.entrepriseId, String(listeId), { nom: String(formData.get("nom") ?? ""), remisePourcent: Number(formData.get("remisePourcent") || 0) }));
  if (!r.ok) return { erreur: t(r.erreur) };
  revalidatePath(`/app/produits/listes-prix/${listeId}`);
  return { message: t("Liste enregistrée.") };
}

export async function supprimerListePrixAction(listeId: string): Promise<EtatListePrix> {
  const { t, u, refus } = await garde();
  if (refus) return { erreur: refus };
  const r = await avecEntreprise(u.entrepriseId, (tx) => supprimerListe(tx, u.entrepriseId, String(listeId)));
  if (!r.ok) return { erreur: t(r.erreur) };
  revalidatePath("/app/produits/listes-prix");
  redirect("/app/produits/listes-prix");
}

/** `prix` vide ou absent : le prix fixe est retiré. */
export async function definirPrixFixeAction(listeId: string, produitId: string, prix: number | null): Promise<EtatListePrix> {
  const { t, u, refus } = await garde();
  if (refus) return { erreur: refus };
  const valeur = prix === null || prix === undefined || Number.isNaN(Number(prix)) ? null : Number(prix);
  const r = await avecEntreprise(u.entrepriseId, (tx) => definirPrixFixe(tx, u.entrepriseId, String(listeId), String(produitId), valeur));
  if (!r.ok) return { erreur: t(r.erreur) };
  revalidatePath(`/app/produits/listes-prix/${listeId}`);
  return { message: t("Prix enregistré.") };
}

export async function affecterListePrixContact(contactId: string, listeId: string | null): Promise<EtatListePrix> {
  const t = await getT();
  const u = await recupererUtilisateurConnecte();
  if (!u) redirect("/connexion");
  if (!peut(u, "CRM", "MODIFIER")) return { erreur: t("Vous n'avez pas le droit de modifier ce contact.") };
  const r = await avecEntreprise(u.entrepriseId, async (tx) => {
    const visibles = await idsVisibles(tx, u, "CRM");
    const [c] = await tx.select({ assigneAId: contact.assigneAId }).from(contact).where(and(eq(contact.id, String(contactId)), eq(contact.entrepriseId, u.entrepriseId)));
    if (!c || (visibles !== "TOUT" && !visibles.includes(c.assigneAId))) return { ok: false, erreur: m("Contact introuvable.") } as const;
    return affecterListeAuContact(tx, u.entrepriseId, String(contactId), listeId ? String(listeId) : null);
  });
  if (!r.ok) return { erreur: t(r.erreur) };
  revalidatePath(`/app/contacts/${contactId}`);
  return { message: t("Liste de prix enregistrée.") };
}
