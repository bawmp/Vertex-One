"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { avecEntreprise } from "@/db/client";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { getT } from "@/lib/i18n/langue";
import { m } from "@/lib/i18n/catalogue";
import { peut } from "@/lib/permissions";
import { alerterParEmail } from "@/lib/notifications/equipe";
import { creerMission, gererMission, ressourcesHumainesDisponibles, suivreMission } from "@/lib/rh/missions";

export type EtatMission = { erreur?: string; message?: string } | null;
type Retour = { erreur?: string } | null;

function rafraichir() {
  revalidatePath("/app/rh/missions");
  revalidatePath("/app/rh", "layout");
}

/**
 * Confie une mission à un collaborateur. Droit et portée revérifiés côté serveur (Administrateur, ou Manager dont la portée RH contient la personne) ;
 * la personne est relue en base avec l'entreprise de la session, jamais crue sur la seule valeur du formulaire.
 */
export async function creerMissionAction(_etat: EtatMission, formData: FormData): Promise<EtatMission> {
  const t = await getT();
  const u = await recupererUtilisateurConnecte();
  if (!u) redirect("/connexion");
  const champ = (k: string) => String(formData.get(k) ?? "");
  const r = await avecEntreprise(u.entrepriseId, async (tx) => {
    if (!(await ressourcesHumainesDisponibles(tx, u.entrepriseId))) return { ok: false as const, erreur: m("Votre abonnement est suspendu : renouvelez-le pour accéder à cette fonctionnalité.") };
    if (!peut(u, "RH", "VOIR")) return { ok: false as const, erreur: m("Vous n'avez pas accès aux Ressources Humaines.") };
    return creerMission(tx, u, champ("utilisateurId"), {
      titre: champ("titre"),
      description: champ("description"),
      resultatAttendu: champ("resultatAttendu"),
      horizon: champ("horizon"),
      dateDebut: champ("dateDebut"),
      dateFin: champ("dateFin"),
    });
  });
  if (!r.ok) return { erreur: t(r.erreur) };
  // L'email part APRÈS la réponse : la personne qui confie la mission n'attend jamais Resend, et un échec d'envoi ne l'annule pas.
  if ("email" in r && r.email) {
    const { to, sujet, html } = r.email;
    after(() => alerterParEmail([to], sujet, html));
  }
  rafraichir();
  return { message: t("Mission confiée.") };
}

/** Point d'avancement de la personne (ou de son manager) : avancement, point de suivi, ou mission terminée. */
export async function suivreMissionAction(missionId: string, avancement: number, note: string, terminer: boolean): Promise<Retour> {
  const t = await getT();
  const u = await recupererUtilisateurConnecte();
  if (!u) redirect("/connexion");
  const r = await avecEntreprise(u.entrepriseId, async (tx) => {
    if (!(await ressourcesHumainesDisponibles(tx, u.entrepriseId))) return { ok: false as const, erreur: m("Votre abonnement est suspendu : renouvelez-le pour accéder à cette fonctionnalité.") };
    return suivreMission(tx, u, String(missionId), { avancement, note: String(note ?? ""), terminer: terminer === true });
  });
  if (!r.ok) return { erreur: t(r.erreur) };
  rafraichir();
  return null;
}

export async function gererMissionAction(missionId: string, action: "ANNULER" | "ROUVRIR" | "SUPPRIMER"): Promise<Retour> {
  const t = await getT();
  const u = await recupererUtilisateurConnecte();
  if (!u) redirect("/connexion");
  if (action !== "ANNULER" && action !== "ROUVRIR" && action !== "SUPPRIMER") return { erreur: t("Action inconnue.") };
  const r = await avecEntreprise(u.entrepriseId, async (tx) => {
    if (!(await ressourcesHumainesDisponibles(tx, u.entrepriseId))) return { ok: false as const, erreur: m("Votre abonnement est suspendu : renouvelez-le pour accéder à cette fonctionnalité.") };
    return gererMission(tx, u, String(missionId), action);
  });
  if (!r.ok) return { erreur: t(r.erreur) };
  rafraichir();
  return null;
}
