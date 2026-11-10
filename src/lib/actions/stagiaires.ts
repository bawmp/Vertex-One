"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { generateRandomString } from "better-auth/crypto";
import { avecEntreprise } from "@/db/client";
import { entreprise, invitation, utilisateur } from "@/db/schema";
import { envoyerEmailInvitation } from "@/lib/invitations/envoi";
import { recupererUtilisateurConnecte, type UtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { erreurDateNaissance } from "@/lib/rh/anniversaires-regles";
import { disponible } from "@/lib/plans";
import { cloturerStagiaireAcademique, convertirStagiaireEnInvitation, creerStagiaireAcademique, deciderStagePro, modifierStagiaireAcademique, supprimerStagiaireAcademique, type SaisieStagiaire } from "@/lib/rh/stage";
import { dejaEmployeDansLeGroupe, MESSAGE_DEJA_EMPLOYE_GROUPE } from "@/lib/rh/unicite-groupe";
import { getT } from "@/lib/i18n/langue";
import { m } from "@/lib/i18n/catalogue";

const CHEMIN = "/app/rh/stagiaires";

export type EtatStagiaire = { erreur?: string; succes?: string } | null;

/** Connecté, module RH disponible (forfait), droit de gérer les stagiaires : Administrateur ou Manager. */
async function garde(action: "CREER" | "MODIFIER"): Promise<{ utilisateurConnecte: UtilisateurConnecte } | { erreur: string }> {
  const t = await getT();
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (utilisateurConnecte.role !== "ADMIN" && utilisateurConnecte.role !== "MANAGER") return { erreur: t("Seul l'Administrateur et les Managers gèrent les stagiaires.") };
  if (!peut(utilisateurConnecte, "RH", action)) return { erreur: t("Vous n'avez pas le droit de gérer les stagiaires.") };
  const [e] = await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) => tx.select({ planAbonnement: entreprise.planAbonnement, statutAbonnement: entreprise.statutAbonnement }).from(entreprise).where(eq(entreprise.id, utilisateurConnecte.entrepriseId)));
  if (!e || !disponible(e, "RH")) return { erreur: t("Votre abonnement est suspendu : renouvelez-le pour accéder à cette fonctionnalité.") };
  return { utilisateurConnecte };
}

async function gardeAdmin(): Promise<{ utilisateurConnecte: UtilisateurConnecte } | { erreur: string }> {
  const t = await getT();
  const g = await garde("MODIFIER");
  if ("erreur" in g) return g;
  if (g.utilisateurConnecte.role !== "ADMIN") return { erreur: t("Seul l'Administrateur peut prendre cette décision.") };
  return g;
}

const texte = (max: number) => z.string().trim().max(max).optional();
const dateIso = z.string().min(1, m("Date requise.")).transform((v) => new Date(`${v}T00:00:00`)).refine((d) => !Number.isNaN(d.getTime()), m("Date invalide."));

const schemaStagiaire = z.object({
  nom: z.string().trim().min(2, m("Le nom est trop court.")).max(120),
  dateNaissance: z.string().trim().optional(),
  telephone: texte(40),
  email: z.union([z.literal(""), z.email(m("Adresse email invalide."))]).optional(),
  etablissement: z.string().trim().min(2, m("L'établissement est requis.")).max(160),
  filiere: texte(120),
  niveau: texte(80),
  tuteurEcoleNom: texte(120),
  tuteurEcoleContact: texte(160),
  conventionReference: texte(120),
  mission: texte(300),
  serviceId: texte(80),
  maitreStageId: texte(80),
  dateDebut: dateIso,
  dateFin: dateIso,
  indemniteMensuelle: z.union([z.literal(""), z.coerce.number().int().min(0).max(100_000_000)]).optional(),
  evaluation: texte(4000),
});

function lireSaisie(formData: FormData, t: Awaited<ReturnType<typeof getT>>): { ok: true; saisie: SaisieStagiaire } | { ok: false; erreur: string } {
  const brut = Object.fromEntries(["nom", "dateNaissance", "telephone", "email", "etablissement", "filiere", "niveau", "tuteurEcoleNom", "tuteurEcoleContact", "conventionReference", "mission", "serviceId", "maitreStageId", "dateDebut", "dateFin", "indemniteMensuelle", "evaluation"].map((k) => [k, String(formData.get(k) ?? "")]));
  const a = schemaStagiaire.safeParse(brut);
  if (!a.success) return { ok: false, erreur: a.error.issues[0]?.message ?? t("Formulaire invalide.") };
  const d = a.data;
  if (d.dateNaissance) {
    const e = erreurDateNaissance(d.dateNaissance, new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Douala" }).format(new Date()));
    if (e) return { ok: false, erreur: t(e) };
  }
  return {
    ok: true,
    saisie: { ...d, email: d.email || undefined, indemniteMensuelle: d.indemniteMensuelle === "" || d.indemniteMensuelle === undefined ? null : d.indemniteMensuelle },
  };
}

export async function creerStagiaireAcademiqueAction(_etat: EtatStagiaire, formData: FormData): Promise<EtatStagiaire> {
  const t = await getT();
  const g = await garde("CREER");
  if ("erreur" in g) return g;
  const lu = lireSaisie(formData, t);
  if (!lu.ok) return { erreur: t(lu.erreur) };
  if (await dejaEmployeDansLeGroupe(g.utilisateurConnecte.entrepriseId, { nom: lu.saisie.nom, telephone: lu.saisie.telephone, dateNaissance: lu.saisie.dateNaissance, email: lu.saisie.email })) return { erreur: t(MESSAGE_DEJA_EMPLOYE_GROUPE) };
  const r = await avecEntreprise(g.utilisateurConnecte.entrepriseId, (tx) => creerStagiaireAcademique(tx, g.utilisateurConnecte, lu.saisie));
  if (r.erreur || !r.id) return { erreur: r.erreur ? t(r.erreur) : t("Création impossible.") };
  revalidatePath(CHEMIN);
  redirect(`${CHEMIN}/${r.id}`);
}

export async function modifierStagiaireAcademiqueAction(id: string, _etat: EtatStagiaire, formData: FormData): Promise<EtatStagiaire> {
  const t = await getT();
  const g = await garde("MODIFIER");
  if ("erreur" in g) return g;
  const lu = lireSaisie(formData, t);
  if (!lu.ok) return { erreur: t(lu.erreur) };
  if (await dejaEmployeDansLeGroupe(g.utilisateurConnecte.entrepriseId, { nom: lu.saisie.nom, telephone: lu.saisie.telephone, dateNaissance: lu.saisie.dateNaissance, email: lu.saisie.email })) return { erreur: t(MESSAGE_DEJA_EMPLOYE_GROUPE) };
  const r = await avecEntreprise(g.utilisateurConnecte.entrepriseId, (tx) => modifierStagiaireAcademique(tx, g.utilisateurConnecte, String(id), lu.saisie));
  if (r.erreur) return { erreur: t(r.erreur) };
  revalidatePath(CHEMIN);
  revalidatePath(`${CHEMIN}/${id}`);
  return { succes: t("Fiche enregistrée.") };
}

const schemaCloture = z.object({ statut: z.enum(["TERMINE", "INTERROMPU"]), evaluation: texte(4000), motif: texte(500) });

export async function cloturerStagiaireAction(id: string, _etat: EtatStagiaire, formData: FormData): Promise<EtatStagiaire> {
  const t = await getT();
  const g = await garde("MODIFIER");
  if ("erreur" in g) return g;
  const a = schemaCloture.safeParse({ statut: formData.get("statut"), evaluation: String(formData.get("evaluation") ?? ""), motif: String(formData.get("motif") ?? "") });
  if (!a.success) return { erreur: a.error.issues[0]?.message ?? t("Formulaire invalide.") };
  const r = await avecEntreprise(g.utilisateurConnecte.entrepriseId, (tx) => cloturerStagiaireAcademique(tx, g.utilisateurConnecte, String(id), a.data.statut, a.data.evaluation, a.data.motif));
  if (r.erreur) return { erreur: t(r.erreur) };
  revalidatePath(CHEMIN);
  revalidatePath(`${CHEMIN}/${id}`);
  return { succes: t("Stage clos.") };
}

const schemaEmbauche = z.object({ role: z.enum(["MANAGER", "EMPLOYE"]), typeContrat: z.enum(["STAGE", "CDI", "CDD"]), dateEmbauche: dateIso });

/** L'étudiant est pris : invitation créée au flux habituel (compte, dossier RH). Administrateur seulement. */
export async function embaucherStagiaireAction(id: string, _etat: EtatStagiaire, formData: FormData): Promise<EtatStagiaire> {
  const t = await getT();
  const g = await gardeAdmin();
  if ("erreur" in g) return g;
  const a = schemaEmbauche.safeParse({ role: formData.get("role"), typeContrat: formData.get("typeContrat"), dateEmbauche: String(formData.get("dateEmbauche") ?? "") });
  if (!a.success) return { erreur: a.error.issues[0]?.message ?? t("Formulaire invalide.") };
  const r = await avecEntreprise(g.utilisateurConnecte.entrepriseId, (tx) => convertirStagiaireEnInvitation(tx, g.utilisateurConnecte.entrepriseId, String(id), a.data.role, a.data.typeContrat, a.data.dateEmbauche));
  if (r.erreur) return { erreur: t(r.erreur) };
  revalidatePath(CHEMIN);
  revalidatePath(`${CHEMIN}/${id}`);
  revalidatePath("/app/parametres/equipe");
  return { succes: t("Invitation créée : {lien} (valable 72 h ; retrouvez-la dans Paramètres → Équipe).", { lien: `/invitation/${r.jeton}` }) };
}

export async function supprimerStagiaireAction(id: string): Promise<EtatStagiaire> {
  const t = await getT();
  const g = await gardeAdmin();
  if ("erreur" in g) return g;
  const r = await avecEntreprise(g.utilisateurConnecte.entrepriseId, (tx) => supprimerStagiaireAcademique(tx, g.utilisateurConnecte.entrepriseId, String(id)));
  if (r.erreur) return { erreur: t(r.erreur) };
  revalidatePath(CHEMIN);
  redirect(CHEMIN);
}

const schemaDecisionPro = z.object({
  decision: z.enum(["EMBAUCHE", "NON_RETENU"]),
  typeContrat: z.enum(["CDI", "CDD"]).optional(),
  dateFinCDD: z.string().optional(),
  dateEffet: dateIso,
  motif: texte(500),
});

/** Décision de fin de stage d'un stagiaire professionnel (employé en période probatoire) : embauché ou non retenu. Administrateur seulement. */
export async function deciderStageProAction(dossierRHId: string, _etat: EtatStagiaire, formData: FormData): Promise<EtatStagiaire> {
  const t = await getT();
  const g = await gardeAdmin();
  if ("erreur" in g) return g;
  const a = schemaDecisionPro.safeParse({ decision: formData.get("decision"), typeContrat: formData.get("typeContrat") || undefined, dateFinCDD: String(formData.get("dateFinCDD") ?? ""), dateEffet: String(formData.get("dateEffet") ?? ""), motif: String(formData.get("motif") ?? "") });
  if (!a.success) return { erreur: a.error.issues[0]?.message ?? t("Formulaire invalide.") };
  const d = a.data;
  let decision: Parameters<typeof deciderStagePro>[3];
  if (d.decision === "EMBAUCHE") {
    if (!d.typeContrat) return { erreur: t("Choisissez le contrat proposé (CDI ou CDD).") };
    decision = { decision: "EMBAUCHE", typeContrat: d.typeContrat, dateFinCDD: d.dateFinCDD ? new Date(`${d.dateFinCDD}T00:00:00`) : undefined };
  } else {
    decision = { decision: "NON_RETENU" };
  }
  const r = await avecEntreprise(g.utilisateurConnecte.entrepriseId, (tx) => deciderStagePro(tx, g.utilisateurConnecte.entrepriseId, String(dossierRHId), decision, d.dateEffet, d.motif));
  if (r.erreur) return { erreur: t(r.erreur) };
  revalidatePath(`/app/rh/${dossierRHId}`);
  revalidatePath(CHEMIN);
  revalidatePath("/app/rh");
  return { succes: d.decision === "EMBAUCHE" ? t("Stagiaire embauché : son contrat est mis à jour.") : t("Stagiaire non retenu : son accès est désactivé.") };
}

const DUREE_INVITATION_STAGIAIRE_MS = 72 * 60 * 60 * 1000; // même durée que creerInvitation()
const schemaStagiairePro = z.object({
  email: z.email(m("Adresse email invalide.")),
  poste: z.string().trim().min(2, m("Le poste est requis.")).max(120),
  dateDebut: dateIso,
  dateFin: dateIso,
});

/**
 * Invite un stagiaire PROFESSIONNEL (compte + contrat Stage + fin de stage). Ouvert à l'Administrateur ET aux Managers (droit RH/CREER), mais borné :
 * le rôle est toujours Employé et le contrat toujours Stage (jamais un Manager ni un autre contrat) ; un Manager en est d'office le responsable
 * (`managerPropose`), donc le stagiaire entre dans sa portée « équipe ». Rien du rôle ni de l'entreprise ne vient du navigateur.
 */
export async function inviterStagiaireProAction(_etat: EtatStagiaire, formData: FormData): Promise<EtatStagiaire> {
  const t = await getT();
  const g = await garde("CREER");
  if ("erreur" in g) return g;
  const u = g.utilisateurConnecte;
  const a = schemaStagiairePro.safeParse(Object.fromEntries(["email", "poste", "dateDebut", "dateFin"].map((k) => [k, String(formData.get(k) ?? "")])));
  if (!a.success) return { erreur: a.error.issues[0]?.message ?? t("Formulaire invalide.") };
  const { poste, dateDebut, dateFin } = a.data;
  const email = a.data.email.toLowerCase();
  if (dateFin <= dateDebut) return { erreur: t("La fin du stage doit être postérieure à son début.") };

  // Responsable : le Manager lui-même ; pour l'Administrateur, celui qu'il a désigné s'il est de la même entreprise (sinon aucun).
  let responsableId: string | undefined = u.role === "MANAGER" ? u.utilisateurId : undefined;
  const demande = String(formData.get("responsableId") ?? "");
  const jeton = generateRandomString(32, "a-z", "A-Z", "0-9");
  const r = await avecEntreprise(u.entrepriseId, async (tx) => {
    if (u.role === "ADMIN" && demande) {
      const [resp] = await tx.select({ id: utilisateur.id }).from(utilisateur).where(and(eq(utilisateur.id, demande), eq(utilisateur.entrepriseId, u.entrepriseId)));
      if (!resp) return { erreur: t("Responsable introuvable.") };
      responsableId = resp.id;
    }
    await tx.insert(invitation).values({
      entrepriseId: u.entrepriseId,
      email,
      roleProposee: "EMPLOYE",
      postePropose: poste,
      typeContratPropose: "STAGE",
      dateEmbauchePropose: dateDebut,
      dateFinPropose: dateFin,
      managerPropose: responsableId,
      jeton,
      expireLe: new Date(Date.now() + DUREE_INVITATION_STAGIAIRE_MS),
    });
    return null;
  });
  if (r?.erreur) return { erreur: t(r.erreur) };

  const { envoye } = await envoyerEmailInvitation({ entrepriseId: u.entrepriseId, email, role: "EMPLOYE", jeton, invitantId: u.utilisateurId, dureeHeures: DUREE_INVITATION_STAGIAIRE_MS / 3_600_000 });
  revalidatePath(CHEMIN);
  return { succes: envoye ? t("Invitation envoyée par email à {email}. Le stagiaire crée son compte depuis le lien reçu.", { email }) : t("Invitation créée, mais l'email n'a pas pu partir : transmettez ce lien à la personne : {lien}", { lien: `/invitation/${jeton}` }) };
}
