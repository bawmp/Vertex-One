import { and, eq } from "drizzle-orm";
import type { TransactionDrizzle } from "@/db/client";
import { entreprise, lead, relanceProspect, utilisateur } from "@/db/schema";
import { m } from "@/lib/i18n/catalogue";
import { peut } from "@/lib/permissions";
import { idsVisibles } from "@/lib/portee";
import { receveursPossibles, type Receveur } from "@/lib/api-externe/assignation";
import type { UtilisateurConnecte } from "@/lib/session";
import { gabaritProspectTransfere } from "./transfert-prospect-email";

export const LONGUEUR_MAX_MOTIF_TRANSFERT = 300;

/** Qui peut confier un prospect à un collègue : l'Administrateur et les Managers (jamais un Employé), et seulement avec le droit de modifier le CRM. */
export function peutTransfererProspect(utilisateurConnecte: UtilisateurConnecte): boolean {
  return (utilisateurConnecte.role === "ADMIN" || utilisateurConnecte.role === "MANAGER") && peut(utilisateurConnecte, "CRM", "MODIFIER");
}

/** Les collègues à qui l'on peut confier des prospects (vide si la personne connectée ne peut pas transférer). */
export async function collaborateursPourTransfert(tx: TransactionDrizzle, utilisateurConnecte: UtilisateurConnecte): Promise<Receveur[]> {
  if (!peutTransfererProspect(utilisateurConnecte)) return [];
  return receveursPossibles(tx, utilisateurConnecte.entrepriseId);
}

export type ResultatTransfert =
  | { ok: true; destinataire: string; email: { to: string; sujet: string; html: string } | null }
  | { ok: false; erreur: string };

/**
 * Confie un prospect (un lead pas encore devenu client) à un collègue de la MÊME entreprise.
 *
 * Tout est relu en base, rien n'est cru sur parole : le droit (Administrateur ou Manager), le prospect (même entreprise grâce à la RLS, portée CRM de la
 * personne qui transfère, pas encore client) et le destinataire (`receveursPossibles` : membre actif de CETTE entreprise qui peut travailler le CRM — jamais
 * un identifiant d'une autre entreprise, d'un client du portail, ou de quelqu'un à qui le CRM est fermé et qui ne verrait pas le prospect).
 * Le transfert est noté dans l'historique du prospect ; ses rappels et son historique de relances le suivent. La relance automatique, elle, continue
 * (elle est liée au prospect, pas à la personne).
 * Renvoie le courrier à envoyer au destinataire : l'appelant l'envoie APRÈS la transaction, jamais dedans.
 */
export async function transfererProspect(
  tx: TransactionDrizzle,
  utilisateurConnecte: UtilisateurConnecte,
  leadId: string,
  destinataireId: string,
  motifBrut: string
): Promise<ResultatTransfert> {
  if (!peutTransfererProspect(utilisateurConnecte)) return { ok: false, erreur: m("Seuls l'Administrateur et les Managers peuvent transférer un prospect.") };

  const motif = String(motifBrut ?? "").trim();
  if (motif.length > LONGUEUR_MAX_MOTIF_TRANSFERT) return { ok: false, erreur: m("Le message est trop long.") };

  const [ligne] = await tx.select().from(lead).where(eq(lead.id, String(leadId ?? "")));
  if (!ligne || ligne.convertiLe) return { ok: false, erreur: m("Prospect introuvable ou déjà devenu client.") };
  const visibles = await idsVisibles(tx, utilisateurConnecte, "CRM");
  if (visibles !== "TOUT" && !visibles.includes(ligne.assigneAId)) return { ok: false, erreur: m("Prospect introuvable ou déjà devenu client.") };

  if (ligne.assigneAId === destinataireId) return { ok: false, erreur: m("Ce prospect est déjà suivi par cette personne.") };
  const [cible] = await receveursPossibles(tx, utilisateurConnecte.entrepriseId, [String(destinataireId ?? "")]);
  if (!cible) return { ok: false, erreur: m("Cette personne ne peut pas recevoir de prospects (compte inactif ou sans accès au CRM).") };

  // `utilisateur` est en RLS permissive : le filtre sur l'entreprise est explicite.
  const noms = async (id: string) => {
    const [u] = await tx.select({ nom: utilisateur.nomComplet }).from(utilisateur).where(and(eq(utilisateur.id, id), eq(utilisateur.entrepriseId, utilisateurConnecte.entrepriseId)));
    return u?.nom ?? null;
  };
  const ancien = await noms(ligne.assigneAId);
  const auteur = await noms(utilisateurConnecte.utilisateurId);

  await tx.update(lead).set({ assigneAId: cible.id }).where(eq(lead.id, ligne.id));

  const phrase = `Prospect transféré de ${ancien ?? "un collègue"} à ${cible.nomComplet} par ${auteur ?? "un responsable"}.`;
  await tx.insert(relanceProspect).values({
    entrepriseId: utilisateurConnecte.entrepriseId,
    leadId: ligne.id,
    canal: "note",
    contenu: motif ? `${phrase}\n${motif}` : phrase,
    auteurId: utilisateurConnecte.utilisateurId,
  });

  // Inutile de prévenir quelqu'un qui se confie le prospect à lui-même.
  if (cible.id === utilisateurConnecte.utilisateurId) return { ok: true, destinataire: cible.nomComplet, email: null };

  const [ent] = await tx.select({ nom: entreprise.nom }).from(entreprise).where(eq(entreprise.id, utilisateurConnecte.entrepriseId));
  const base = (process.env.BETTER_AUTH_URL ?? "http://localhost:3000").replace(/\/+$/, "");
  const { sujet, html } = gabaritProspectTransfere({
    nomPersonne: cible.nomComplet,
    transferePar: auteur ?? "Votre responsable",
    entreprise: ent?.nom ?? "votre entreprise",
    prospect: { nom: ligne.nom, societe: ligne.societeCliente, telephone: ligne.telephone, email: ligne.email },
    motif,
    lien: `${base}/app/leads/${ligne.id}`,
  });
  return { ok: true, destinataire: cible.nomComplet, email: { to: cible.email, sujet, html } };
}
