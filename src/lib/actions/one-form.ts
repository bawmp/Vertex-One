"use server";

import { z } from "zod";
import { eq, and, asc, count } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { generateRandomString } from "better-auth/crypto";
import { db, avecEntreprise } from "@/db/client";
import { formulaire, champFormulaire, reponseFormulaire, valeurChampReponse, lead, utilisateur } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { verifierTurnstile } from "@/lib/turnstile/client";
import { envoyerEmail } from "@/lib/email/client";
import { corpsVersHtml } from "@/lib/email/modeles";

export type EtatOneForm = { erreur?: string; succes?: string } | null;

const TYPES_CHAMP = ["TEXTE_COURT", "TEXTE_LONG", "EMAIL", "TELEPHONE", "NOMBRE", "DATE", "CHOIX_UNIQUE", "CHOIX_MULTIPLE", "LISTE_DEROULANTE"] as const;

async function garde(action: "CREER" | "MODIFIER" | "SUPPRIMER") {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte.role, "ONE_FORM", action)) {
    return { utilisateurConnecte: null, erreur: "Vous n'avez pas les droits nécessaires." } as const;
  }
  return { utilisateurConnecte, erreur: null } as const;
}

export async function creerFormulaire(_etat: EtatOneForm, formData: FormData): Promise<EtatOneForm> {
  const { utilisateurConnecte, erreur } = await garde("CREER");
  if (erreur) return { erreur };

  const analyse = z.object({ titre: z.string().trim().min(2, "Le titre est trop court.") }).safeParse({ titre: formData.get("titre") });
  if (!analyse.success) return { erreur: analyse.error.issues[0]?.message ?? "Formulaire invalide." };

  const slug = generateRandomString(10, "a-z", "A-Z", "0-9");
  const [nouveau] = await avecEntreprise(utilisateurConnecte!.entrepriseId, (tx) =>
    tx
      .insert(formulaire)
      .values({ entrepriseId: utilisateurConnecte!.entrepriseId, titre: analyse.data.titre, slug, creeParId: utilisateurConnecte!.utilisateurId })
      .returning({ id: formulaire.id })
  );

  revalidatePath("/app/one-form");
  redirect(`/app/one-form/${nouveau.id}`);
}

export async function supprimerFormulaire(formulaireId: string): Promise<void> {
  const { utilisateurConnecte, erreur } = await garde("SUPPRIMER");
  if (erreur || !utilisateurConnecte) return;

  await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const reponses = await tx.select({ id: reponseFormulaire.id }).from(reponseFormulaire).where(eq(reponseFormulaire.formulaireId, formulaireId));
    for (const r of reponses) {
      await tx.delete(valeurChampReponse).where(eq(valeurChampReponse.reponseFormulaireId, r.id));
    }
    await tx.delete(reponseFormulaire).where(eq(reponseFormulaire.formulaireId, formulaireId));
    await tx.delete(champFormulaire).where(eq(champFormulaire.formulaireId, formulaireId));
    await tx.delete(formulaire).where(eq(formulaire.id, formulaireId));
  });

  revalidatePath("/app/one-form");
  redirect("/app/one-form");
}

const schemaParametres = z.object({
  formulaireId: z.string(),
  titre: z.string().trim().min(2, "Le titre est trop court."),
  description: z.string().trim().optional(),
  messageConfirmation: z.string().trim().min(1, "Le message de confirmation ne peut pas être vide."),
  creerLeadALaReponse: z.coerce.boolean(),
  notifierParEmail: z.coerce.boolean(),
  // datetime-local envoie une chaîne locale sans fuseau (ex. "2026-09-20T14:30")
  // — new Date() l'interprète dans le fuseau du serveur, cohérent avec le
  // reste du produit (aucune gestion de fuseau par entreprise ailleurs).
  ouvertureLe: z
    .string()
    .optional()
    .transform((v) => (v ? new Date(v) : null)),
  fermetureLe: z
    .string()
    .optional()
    .transform((v) => (v ? new Date(v) : null)),
  limiteReponses: z
    .string()
    .optional()
    .transform((v) => (v ? Number(v) : null))
    .refine((v) => v === null || (Number.isInteger(v) && v > 0), "La limite de réponses doit être un nombre entier positif."),
});

export async function modifierParametresFormulaire(_etat: EtatOneForm, formData: FormData): Promise<EtatOneForm> {
  const { utilisateurConnecte, erreur } = await garde("MODIFIER");
  if (erreur) return { erreur };

  const analyse = schemaParametres.safeParse({
    formulaireId: formData.get("formulaireId"),
    titre: formData.get("titre"),
    description: formData.get("description") || undefined,
    messageConfirmation: formData.get("messageConfirmation"),
    creerLeadALaReponse: formData.get("creerLeadALaReponse") === "on",
    notifierParEmail: formData.get("notifierParEmail") === "on",
    ouvertureLe: formData.get("ouvertureLe") || undefined,
    fermetureLe: formData.get("fermetureLe") || undefined,
    limiteReponses: formData.get("limiteReponses") || undefined,
  });
  if (!analyse.success) return { erreur: analyse.error.issues[0]?.message ?? "Formulaire invalide." };
  const { formulaireId, titre, description, messageConfirmation, creerLeadALaReponse, notifierParEmail, ouvertureLe, fermetureLe, limiteReponses } = analyse.data;

  if (ouvertureLe && fermetureLe && ouvertureLe >= fermetureLe) {
    return { erreur: "La date d'ouverture doit précéder la date de fermeture." };
  }

  await avecEntreprise(utilisateurConnecte!.entrepriseId, (tx) =>
    tx
      .update(formulaire)
      .set({ titre, description, messageConfirmation, creerLeadALaReponse, notifierParEmail, ouvertureLe, fermetureLe, limiteReponses })
      .where(eq(formulaire.id, formulaireId))
  );

  revalidatePath(`/app/one-form/${formulaireId}`);
  return null;
}

export async function publierFormulaire(formulaireId: string, publie: boolean): Promise<void> {
  const { utilisateurConnecte, erreur } = await garde("MODIFIER");
  if (erreur || !utilisateurConnecte) return;

  await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) => tx.update(formulaire).set({ publie }).where(eq(formulaire.id, formulaireId)));

  revalidatePath(`/app/one-form/${formulaireId}`);
}

const schemaChamp = z.object({
  formulaireId: z.string(),
  type: z.enum(TYPES_CHAMP),
  libelle: z.string().trim().min(1, "Le libellé est requis."),
  obligatoire: z.coerce.boolean(),
  options: z.string().trim().optional(), // une option par ligne, saisie libre
});

export async function ajouterChamp(_etat: EtatOneForm, formData: FormData): Promise<EtatOneForm> {
  const { utilisateurConnecte, erreur } = await garde("MODIFIER");
  if (erreur) return { erreur };

  const analyse = schemaChamp.safeParse({
    formulaireId: formData.get("formulaireId"),
    type: formData.get("type"),
    libelle: formData.get("libelle"),
    obligatoire: formData.get("obligatoire") === "on",
    options: formData.get("options") || undefined,
  });
  if (!analyse.success) return { erreur: analyse.error.issues[0]?.message ?? "Formulaire invalide." };
  const { formulaireId, type, libelle, obligatoire, options } = analyse.data;

  const optionsListe = options
    ? options
        .split("\n")
        .map((o) => o.trim())
        .filter(Boolean)
    : undefined;

  await avecEntreprise(utilisateurConnecte!.entrepriseId, async (tx) => {
    const existants = await tx.select({ ordre: champFormulaire.ordre }).from(champFormulaire).where(eq(champFormulaire.formulaireId, formulaireId));
    const prochainOrdre = existants.length > 0 ? Math.max(...existants.map((e) => e.ordre)) + 1 : 0;
    await tx.insert(champFormulaire).values({
      entrepriseId: utilisateurConnecte!.entrepriseId,
      formulaireId,
      type,
      libelle,
      obligatoire,
      options: optionsListe,
      ordre: prochainOrdre,
    });
  });

  revalidatePath(`/app/one-form/${formulaireId}`);
  return null;
}

export async function supprimerChamp(champId: string, formulaireId: string): Promise<void> {
  const { utilisateurConnecte, erreur } = await garde("MODIFIER");
  if (erreur || !utilisateurConnecte) return;

  await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) => tx.delete(champFormulaire).where(eq(champFormulaire.id, champId)));

  revalidatePath(`/app/one-form/${formulaireId}`);
}

/** Remplace intégralement l'ordre des champs — même patron que definirOrdreModules() (src/lib/actions/preferences.ts). */
export async function reordonnerChamps(formulaireId: string, idsOrdonnes: string[]): Promise<void> {
  const { utilisateurConnecte, erreur } = await garde("MODIFIER");
  if (erreur || !utilisateurConnecte) return;

  await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    for (let i = 0; i < idsOrdonnes.length; i++) {
      await tx.update(champFormulaire).set({ ordre: i }).where(and(eq(champFormulaire.id, idsOrdonnes[i]), eq(champFormulaire.formulaireId, formulaireId)));
    }
  });

  revalidatePath(`/app/one-form/${formulaireId}`);
}

// --- Partie publique — aucune session, voir src/app/formulaire/[slug]/page.tsx ---

const schemaSoumission = z.record(z.string(), z.string());

type FormulaireCible = typeof formulaire.$inferSelect;

/**
 * Partagée entre la page publique (affiche un message à la place du
 * formulaire plutôt que de laisser un visiteur remplir un formulaire fermé)
 * et soumettreReponseFormulaire() (rejet serveur, toujours vérifié même si
 * le client contourne l'affichage). reponseFormulaire n'a aucune policy de
 * lecture anonyme (RLS strictement standard, voir src/db/schema.ts) — le
 * comptage passe donc par avecEntreprise(), jamais un db.select() nu qui
 * renverrait toujours 0 ligne et rendrait la limite inopérante.
 */
export async function verifierDisponibiliteFormulaire(formulaireCible: FormulaireCible): Promise<string | null> {
  const maintenant = new Date();
  if (formulaireCible.ouvertureLe && maintenant < formulaireCible.ouvertureLe) {
    return "Ce formulaire n'est pas encore ouvert aux réponses.";
  }
  if (formulaireCible.fermetureLe && maintenant > formulaireCible.fermetureLe) {
    return "Ce formulaire n'accepte plus de réponses.";
  }
  if (formulaireCible.limiteReponses !== null) {
    const total = await avecEntreprise(formulaireCible.entrepriseId, async (tx) => {
      const [{ valeur }] = await tx.select({ valeur: count() }).from(reponseFormulaire).where(eq(reponseFormulaire.formulaireId, formulaireCible.id));
      return valeur;
    });
    if (total >= formulaireCible.limiteReponses) {
      return "Ce formulaire a atteint son nombre maximal de réponses.";
    }
  }
  return null;
}

/**
 * Route publique — même patron que accepterInvitation() (src/lib/actions/
 * invitation.ts) : résout `formulaire` par son slug via une lecture
 * anonyme (permise par la policy RLS "lecture_publique_ou_entreprise",
 * voir src/db/schema.ts), puis écrit via avecEntreprise(formulaire.
 * entrepriseId, ...) — aucune dérogation RLS nécessaire sur les tables de
 * réponses elles-mêmes.
 */
export async function soumettreReponseFormulaire(slug: string, formData: FormData): Promise<{ erreur?: string }> {
  const [formulaireCible] = await db.select().from(formulaire).where(and(eq(formulaire.slug, slug), eq(formulaire.publie, true)));
  if (!formulaireCible) return { erreur: "Ce formulaire n'existe pas ou n'est plus disponible." };

  const raisonIndisponible = await verifierDisponibiliteFormulaire(formulaireCible);
  if (raisonIndisponible) return { erreur: raisonIndisponible };

  // Widget Cloudflare Turnstile rendu en implicite (script + <div
  // class="cf-turnstile">, voir formulaire-remplissage-public.tsx) : à
  // l'intérieur d'un <form>, il ajoute lui-même ce champ caché au submit —
  // aucun JavaScript applicatif à écrire pour le récupérer.
  const jetonTurnstile = String(formData.get("cf-turnstile-response") ?? "");
  if (!(await verifierTurnstile(jetonTurnstile))) {
    return { erreur: "Vérification anti-spam échouée — veuillez réessayer." };
  }

  const champs = await db.select().from(champFormulaire).where(eq(champFormulaire.formulaireId, formulaireCible.id)).orderBy(asc(champFormulaire.ordre));

  const valeurs: Record<string, string> = {};
  for (const champ of champs) {
    const brut = formData.getAll(champ.id).map(String).filter(Boolean);
    const valeur = brut.join(", ");
    if (champ.obligatoire && !valeur) {
      return { erreur: `Le champ "${champ.libelle}" est obligatoire.` };
    }
    if (valeur) valeurs[champ.id] = valeur;
  }
  schemaSoumission.parse(valeurs); // garde-fou de type, ne devrait jamais échouer ici

  await avecEntreprise(formulaireCible.entrepriseId, async (tx) => {
    const [reponse] = await tx
      .insert(reponseFormulaire)
      .values({ entrepriseId: formulaireCible.entrepriseId, formulaireId: formulaireCible.id })
      .returning({ id: reponseFormulaire.id });

    for (const [champId, valeur] of Object.entries(valeurs)) {
      await tx.insert(valeurChampReponse).values({ entrepriseId: formulaireCible.entrepriseId, reponseFormulaireId: reponse.id, champFormulaireId: champId, valeur });
    }

    // Heuristique volontairement simple (V1, pas de correspondance de
    // champs configurable) : un Lead exige un téléphone (NOT NULL) — sans
    // champ TELEPHONE rempli, on n'essaie pas d'en créer un plutôt que de
    // fabriquer une valeur arbitraire.
    if (formulaireCible.creerLeadALaReponse) {
      const champTelephone = champs.find((c) => c.type === "TELEPHONE");
      const valeurTelephone = champTelephone ? valeurs[champTelephone.id] : undefined;
      if (valeurTelephone) {
        const champNom = champs.find((c) => c.type === "TEXTE_COURT");
        const champEmail = champs.find((c) => c.type === "EMAIL");
        const [nouveauLead] = await tx
          .insert(lead)
          .values({
            entrepriseId: formulaireCible.entrepriseId,
            nom: (champNom && valeurs[champNom.id]) || formulaireCible.titre,
            telephone: valeurTelephone,
            email: (champEmail && valeurs[champEmail.id]) || undefined,
            assigneAId: formulaireCible.creeParId,
          })
          .returning({ id: lead.id });
        await tx.update(reponseFormulaire).set({ leadId: nouveauLead.id }).where(eq(reponseFormulaire.id, reponse.id));
      }
    }

    if (formulaireCible.notifierParEmail) {
      const [createur] = await tx.select({ email: utilisateur.email }).from(utilisateur).where(eq(utilisateur.id, formulaireCible.creeParId));
      if (createur?.email) {
        const corps = champs
          .filter((c) => valeurs[c.id])
          .map((c) => `${c.libelle} : ${valeurs[c.id]}`)
          .join("\n");
        // Ne bloque jamais la soumission : un échec d'envoi (ex. Resend non
        // configurée, voir CLAUDE.md) reste silencieux pour le visiteur, qui
        // a bien répondu quoi qu'il arrive côté notification.
        await envoyerEmail({
          to: createur.email,
          subject: `Nouvelle réponse — ${formulaireCible.titre}`,
          html: corpsVersHtml(corps || "(réponse sans champ rempli)"),
        });
      }
    }
  });

  return {};
}
