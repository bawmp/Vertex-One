"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { getT } from "@/lib/i18n/langue";
import { alerterParEmail } from "@/lib/notifications/equipe";
import { accepterTransfert, annulerTransfert, proposerTransfert, refuserTransfert, type Courrier } from "@/lib/rh/transfert";

export type EtatTransfert = { erreur?: string; message?: string } | null;
type Retour = { erreur?: string } | null;

/** Les emails partent APRÈS la réponse : l'Administrateur n'attend jamais Resend, et un échec d'envoi n'annule pas le transfert. */
function envoyerApres(courriers: Courrier[]) {
  for (const c of courriers) after(() => alerterParEmail([c.to], c.sujet, c.html));
}

function rafraichir() {
  revalidatePath("/app/rh/transferts");
  revalidatePath("/app/rh", "layout");
}

/** L'Administrateur d'origine propose le transfert d'un collaborateur vers une autre entreprise du groupe. Tout est revérifié côté serveur. */
export async function proposerTransfertAction(_etat: EtatTransfert, formData: FormData): Promise<EtatTransfert> {
  const t = await getT();
  const u = await recupererUtilisateurConnecte();
  if (!u) redirect("/connexion");
  const r = await proposerTransfert(u, String(formData.get("personneId") ?? ""), String(formData.get("entrepriseId") ?? ""), String(formData.get("message") ?? ""));
  if (!r.ok) return { erreur: t(r.erreur) };
  envoyerApres(r.courriers);
  rafraichir();
  return { message: t("Demande envoyée : l'Administrateur de l'autre entreprise doit l'accepter.") };
}

export async function annulerTransfertAction(ligneId: string): Promise<Retour> {
  const t = await getT();
  const u = await recupererUtilisateurConnecte();
  if (!u) redirect("/connexion");
  const r = await annulerTransfert(u, String(ligneId));
  if (!r.ok) return { erreur: t(r.erreur) };
  rafraichir();
  return null;
}

export async function refuserTransfertAction(ligneId: string, motif: string): Promise<Retour> {
  const t = await getT();
  const u = await recupererUtilisateurConnecte();
  if (!u) redirect("/connexion");
  const r = await refuserTransfert(u, String(ligneId), String(motif ?? ""));
  if (!r.ok) return { erreur: t(r.erreur) };
  envoyerApres(r.courriers);
  rafraichir();
  return null;
}

export async function accepterTransfertAction(ligneId: string, responsableId: string): Promise<Retour> {
  const t = await getT();
  const u = await recupererUtilisateurConnecte();
  if (!u) redirect("/connexion");
  const r = await accepterTransfert(u, String(ligneId), responsableId ? String(responsableId) : null);
  if (!r.ok) return { erreur: t(r.erreur) };
  envoyerApres(r.courriers);
  rafraichir();
  return null;
}
