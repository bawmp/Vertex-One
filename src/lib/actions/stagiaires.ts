"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { avecEntreprise } from "@/db/client";
import { entreprise } from "@/db/schema";
import { recupererUtilisateurConnecte, type UtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { disponible } from "@/lib/plans";
import { cloturerStagiaireAcademique, convertirStagiaireEnInvitation, creerStagiaireAcademique, deciderStagePro, modifierStagiaireAcademique, supprimerStagiaireAcademique, type SaisieStagiaire } from "@/lib/rh/stage";

const CHEMIN = "/app/rh/stagiaires";

export type EtatStagiaire = { erreur?: string; succes?: string } | null;

/** Connecté, module RH disponible (forfait), droit de gérer les stagiaires : Administrateur ou Manager. */
async function garde(action: "CREER" | "MODIFIER"): Promise<{ utilisateurConnecte: UtilisateurConnecte } | { erreur: string }> {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (utilisateurConnecte.role !== "ADMIN" && utilisateurConnecte.role !== "MANAGER") return { erreur: "Seul l'Administrateur et les Managers gèrent les stagiaires." };
  if (!peut(utilisateurConnecte, "RH", action)) return { erreur: "Vous n'avez pas le droit de gérer les stagiaires." };
  const [e] = await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) => tx.select({ planAbonnement: entreprise.planAbonnement, statutAbonnement: entreprise.statutAbonnement }).from(entreprise).where(eq(entreprise.id, utilisateurConnecte.entrepriseId)));
  if (!e || !disponible(e, "RH")) return { erreur: "Les Ressources Humaines sont disponibles à partir du forfait Business." };
  return { utilisateurConnecte };
}

async function gardeAdmin(): Promise<{ utilisateurConnecte: UtilisateurConnecte } | { erreur: string }> {
  const g = await garde("MODIFIER");
  if ("erreur" in g) return g;
  if (g.utilisateurConnecte.role !== "ADMIN") return { erreur: "Seul l'Administrateur peut prendre cette décision." };
  return g;
}

const texte = (max: number) => z.string().trim().max(max).optional();
const dateIso = z.string().min(1, "Date requise.").transform((v) => new Date(`${v}T00:00:00`)).refine((d) => !Number.isNaN(d.getTime()), "Date invalide.");

const schemaStagiaire = z.object({
  nom: z.string().trim().min(2, "Le nom est trop court.").max(120),
  telephone: texte(40),
  email: z.union([z.literal(""), z.email("Adresse email invalide.")]).optional(),
  etablissement: z.string().trim().min(2, "L'établissement est requis.").max(160),
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

function lireSaisie(formData: FormData): { ok: true; saisie: SaisieStagiaire } | { ok: false; erreur: string } {
  const brut = Object.fromEntries(["nom", "telephone", "email", "etablissement", "filiere", "niveau", "tuteurEcoleNom", "tuteurEcoleContact", "conventionReference", "mission", "serviceId", "maitreStageId", "dateDebut", "dateFin", "indemniteMensuelle", "evaluation"].map((k) => [k, String(formData.get(k) ?? "")]));
  const a = schemaStagiaire.safeParse(brut);
  if (!a.success) return { ok: false, erreur: a.error.issues[0]?.message ?? "Formulaire invalide." };
  const d = a.data;
  return {
    ok: true,
    saisie: { ...d, email: d.email || undefined, indemniteMensuelle: d.indemniteMensuelle === "" || d.indemniteMensuelle === undefined ? null : d.indemniteMensuelle },
  };
}

export async function creerStagiaireAcademiqueAction(_etat: EtatStagiaire, formData: FormData): Promise<EtatStagiaire> {
  const g = await garde("CREER");
  if ("erreur" in g) return g;
  const lu = lireSaisie(formData);
  if (!lu.ok) return { erreur: lu.erreur };
  const r = await avecEntreprise(g.utilisateurConnecte.entrepriseId, (tx) => creerStagiaireAcademique(tx, g.utilisateurConnecte, lu.saisie));
  if (r.erreur || !r.id) return { erreur: r.erreur ?? "Création impossible." };
  revalidatePath(CHEMIN);
  redirect(`${CHEMIN}/${r.id}`);
}

export async function modifierStagiaireAcademiqueAction(id: string, _etat: EtatStagiaire, formData: FormData): Promise<EtatStagiaire> {
  const g = await garde("MODIFIER");
  if ("erreur" in g) return g;
  const lu = lireSaisie(formData);
  if (!lu.ok) return { erreur: lu.erreur };
  const r = await avecEntreprise(g.utilisateurConnecte.entrepriseId, (tx) => modifierStagiaireAcademique(tx, g.utilisateurConnecte, String(id), lu.saisie));
  if (r.erreur) return { erreur: r.erreur };
  revalidatePath(CHEMIN);
  revalidatePath(`${CHEMIN}/${id}`);
  return { succes: "Fiche enregistrée." };
}

const schemaCloture = z.object({ statut: z.enum(["TERMINE", "INTERROMPU"]), evaluation: texte(4000), motif: texte(500) });

export async function cloturerStagiaireAction(id: string, _etat: EtatStagiaire, formData: FormData): Promise<EtatStagiaire> {
  const g = await garde("MODIFIER");
  if ("erreur" in g) return g;
  const a = schemaCloture.safeParse({ statut: formData.get("statut"), evaluation: String(formData.get("evaluation") ?? ""), motif: String(formData.get("motif") ?? "") });
  if (!a.success) return { erreur: a.error.issues[0]?.message ?? "Formulaire invalide." };
  const r = await avecEntreprise(g.utilisateurConnecte.entrepriseId, (tx) => cloturerStagiaireAcademique(tx, g.utilisateurConnecte, String(id), a.data.statut, a.data.evaluation, a.data.motif));
  if (r.erreur) return { erreur: r.erreur };
  revalidatePath(CHEMIN);
  revalidatePath(`${CHEMIN}/${id}`);
  return { succes: "Stage clos." };
}

const schemaEmbauche = z.object({ role: z.enum(["MANAGER", "EMPLOYE"]), typeContrat: z.enum(["STAGE", "CDI", "CDD"]), dateEmbauche: dateIso });

/** L'étudiant est pris : invitation créée au flux habituel (compte, dossier RH). Administrateur seulement. */
export async function embaucherStagiaireAction(id: string, _etat: EtatStagiaire, formData: FormData): Promise<EtatStagiaire> {
  const g = await gardeAdmin();
  if ("erreur" in g) return g;
  const a = schemaEmbauche.safeParse({ role: formData.get("role"), typeContrat: formData.get("typeContrat"), dateEmbauche: String(formData.get("dateEmbauche") ?? "") });
  if (!a.success) return { erreur: a.error.issues[0]?.message ?? "Formulaire invalide." };
  const r = await avecEntreprise(g.utilisateurConnecte.entrepriseId, (tx) => convertirStagiaireEnInvitation(tx, g.utilisateurConnecte.entrepriseId, String(id), a.data.role, a.data.typeContrat, a.data.dateEmbauche));
  if (r.erreur) return { erreur: r.erreur };
  revalidatePath(CHEMIN);
  revalidatePath(`${CHEMIN}/${id}`);
  revalidatePath("/app/parametres/equipe");
  return { succes: `Invitation créée : /invitation/${r.jeton} (valable 72 h ; retrouvez-la dans Paramètres → Équipe).` };
}

export async function supprimerStagiaireAction(id: string): Promise<EtatStagiaire> {
  const g = await gardeAdmin();
  if ("erreur" in g) return g;
  const r = await avecEntreprise(g.utilisateurConnecte.entrepriseId, (tx) => supprimerStagiaireAcademique(tx, g.utilisateurConnecte.entrepriseId, String(id)));
  if (r.erreur) return { erreur: r.erreur };
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
  const g = await gardeAdmin();
  if ("erreur" in g) return g;
  const a = schemaDecisionPro.safeParse({ decision: formData.get("decision"), typeContrat: formData.get("typeContrat") || undefined, dateFinCDD: String(formData.get("dateFinCDD") ?? ""), dateEffet: String(formData.get("dateEffet") ?? ""), motif: String(formData.get("motif") ?? "") });
  if (!a.success) return { erreur: a.error.issues[0]?.message ?? "Formulaire invalide." };
  const d = a.data;
  let decision: Parameters<typeof deciderStagePro>[3];
  if (d.decision === "EMBAUCHE") {
    if (!d.typeContrat) return { erreur: "Choisissez le contrat proposé (CDI ou CDD)." };
    decision = { decision: "EMBAUCHE", typeContrat: d.typeContrat, dateFinCDD: d.dateFinCDD ? new Date(`${d.dateFinCDD}T00:00:00`) : undefined };
  } else {
    decision = { decision: "NON_RETENU" };
  }
  const r = await avecEntreprise(g.utilisateurConnecte.entrepriseId, (tx) => deciderStagePro(tx, g.utilisateurConnecte.entrepriseId, String(dossierRHId), decision, d.dateEffet, d.motif));
  if (r.erreur) return { erreur: r.erreur };
  revalidatePath(`/app/rh/${dossierRHId}`);
  revalidatePath(CHEMIN);
  revalidatePath("/app/rh");
  return { succes: d.decision === "EMBAUCHE" ? "Stagiaire embauché : son contrat est mis à jour." : "Stagiaire non retenu : son accès est désactivé." };
}
