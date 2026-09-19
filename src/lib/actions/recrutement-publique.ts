"use server";

import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, parametreRecrutement, posteOuvert, candidature, utilisateur } from "@/db/schema";
import { disponibleAddon } from "@/lib/plans";
import { televerserDocument, effacerObjetStockage } from "@/lib/documents/stockage";
import { validerCv } from "@/lib/recrutement/validation";
import { nomAffichable, nomFichierSain } from "@/lib/one-form/fichiers";
import { verifierTurnstile } from "@/lib/turnstile/client";
import { envoyerEmail } from "@/lib/email/client";
import { corpsVersHtml } from "@/lib/email/modeles";

/**
 * Actions publiques, sans session — même patron exact que
 * src/lib/actions/reservations-publiques.ts : entrepriseId toujours
 * re-résolu côté serveur depuis le slug, jamais reçu du client.
 */

export type ParametresRecrutementPublics = {
  entrepriseId: string;
  nomEntreprise: string;
  titre: string;
  texte: string | null;
  avantages: string[];
  logoCleStockage: string | null;
  couleurMarque: string | null;
};

export async function resoudreParametresRecrutementPublics(slug: string): Promise<ParametresRecrutementPublics | null> {
  const [params] = await db
    .select({
      entrepriseId: parametreRecrutement.entrepriseId,
      titre: parametreRecrutement.titre,
      texte: parametreRecrutement.texte,
      avantages: parametreRecrutement.avantages,
    })
    .from(parametreRecrutement)
    .where(and(eq(parametreRecrutement.slug, slug), eq(parametreRecrutement.publie, true)));
  if (!params) return null;

  const resultat = await avecEntreprise(params.entrepriseId, async (tx) => {
    const [monEntreprise] = await tx
      .select({
        id: entreprise.id,
        nom: entreprise.nom,
        statutAbonnement: entreprise.statutAbonnement,
        logoCleStockage: entreprise.logoCleStockage,
        couleurMarque: entreprise.couleurMarque,
      })
      .from(entreprise)
      .where(eq(entreprise.id, params.entrepriseId));
    if (!monEntreprise) return null;
    if (!(await disponibleAddon(tx, monEntreprise, "RECRUTEMENT"))) return null;
    return { nomEntreprise: monEntreprise.nom, logoCleStockage: monEntreprise.logoCleStockage, couleurMarque: monEntreprise.couleurMarque };
  });
  if (!resultat) return null;

  return { entrepriseId: params.entrepriseId, titre: params.titre, texte: params.texte, avantages: params.avantages ?? [], ...resultat };
}

export type PosteOuvertPublic = { id: string; titre: string; description: string | null; lieu: string | null; typeContrat: string | null };

const COLONNES_POSTE_PUBLIC = {
  id: posteOuvert.id,
  titre: posteOuvert.titre,
  description: posteOuvert.description,
  lieu: posteOuvert.lieu,
  typeContrat: posteOuvert.typeContrat,
};

export async function obtenirPostesOuverts(slug: string): Promise<PosteOuvertPublic[]> {
  const params = await resoudreParametresRecrutementPublics(slug);
  if (!params) return [];

  return avecEntreprise(params.entrepriseId, (tx) =>
    tx
      .select(COLONNES_POSTE_PUBLIC)
      .from(posteOuvert)
      .where(and(eq(posteOuvert.entrepriseId, params.entrepriseId), eq(posteOuvert.actif, true)))
      .orderBy(desc(posteOuvert.creeLe))
  );
}

export async function obtenirPosteOuvert(slug: string, posteId: string): Promise<PosteOuvertPublic | null> {
  const params = await resoudreParametresRecrutementPublics(slug);
  if (!params) return null;

  const [poste] = await avecEntreprise(params.entrepriseId, (tx) =>
    tx
      .select(COLONNES_POSTE_PUBLIC)
      .from(posteOuvert)
      .where(and(eq(posteOuvert.id, posteId), eq(posteOuvert.entrepriseId, params.entrepriseId), eq(posteOuvert.actif, true)))
  );
  return poste ?? null;
}

const schemaCandidature = z.object({
  slug: z.string(),
  posteId: z.string(),
  nom: z.string().trim().min(2, "Le nom est trop court."),
  telephone: z.string().trim().min(6, "Numéro de téléphone invalide."),
  email: z.email().optional().or(z.literal("")),
  message: z.string().trim().optional(),
});

export type EtatCandidature = { erreur?: string; succes?: boolean; prenom?: string } | null;

export async function soumettreCandidature(_etat: EtatCandidature, formData: FormData): Promise<EtatCandidature> {
  const analyse = schemaCandidature.safeParse({
    slug: formData.get("slug"),
    posteId: formData.get("posteId"),
    nom: formData.get("nom"),
    telephone: formData.get("telephone"),
    email: formData.get("email") || "",
    message: formData.get("message") || "",
  });
  if (!analyse.success) {
    return { erreur: analyse.error.issues[0]?.message ?? "Formulaire invalide." };
  }
  const { slug, posteId, nom, telephone, email, message } = analyse.data;

  // Formulaire public et anonyme qui reçoit un fichier : même protection
  // anti-spam que One Form (fail-open tant que TURNSTILE_SECRET_KEY n'existe pas).
  if (!(await verifierTurnstile(String(formData.get("cf-turnstile-response") ?? "")))) {
    return { erreur: "Vérification anti-spam échouée — veuillez réessayer." };
  }

  const cv = formData.get("cv");
  if (!(cv instanceof File)) {
    return { erreur: "Sélectionnez un CV." };
  }
  const validation = await validerCv(cv);
  if (!validation.ok) return { erreur: validation.erreur };

  const params = await resoudreParametresRecrutementPublics(slug);
  if (!params) return { erreur: "Cette offre n'est plus disponible." };

  const poste = await obtenirPosteOuvert(slug, posteId);
  if (!poste) return { erreur: "Ce poste n'est plus disponible." };

  const contenu = Buffer.from(await cv.arrayBuffer());
  // Nom de stockage assaini, extension et type MIME imposés par le format réel
  // détecté — jamais ceux déclarés par le navigateur.
  const { televerse, cleStockage } = await televerserDocument({
    entrepriseId: params.entrepriseId,
    nomFichier: nomFichierSain(cv.name, validation.format.extension),
    typeMime: validation.format.mime,
    contenu,
    dossier: "candidatures",
  });
  // Jamais le message technique (ex. "Stockage R2 non configuré") à un
  // candidat externe — déjà journalisé côté serveur par televerserDocument().
  if (!televerse) return { erreur: "Le téléversement du CV a échoué, réessayez plus tard." };

  let destinatairesAdmin: string[];
  try {
    destinatairesAdmin = await avecEntreprise(params.entrepriseId, async (tx) => {
      await tx.insert(candidature).values({
        entrepriseId: params.entrepriseId,
        posteId,
        nom,
        telephone,
        email: email || undefined,
        message: message || undefined,
        cvCleStockage: cleStockage,
        cvNomFichier: nomAffichable(cv.name),
        cvTypeMime: validation.format.mime,
        cvTailleOctets: contenu.length,
      });
      const admins = await tx
        .select({ email: utilisateur.email })
        .from(utilisateur)
        .where(and(eq(utilisateur.entrepriseId, params.entrepriseId), eq(utilisateur.role, "ADMIN")));
      return admins.map((a) => a.email);
    });
  } catch (erreur) {
    // Candidature non enregistrée : le CV déposé serait orphelin.
    await effacerObjetStockage(cleStockage).catch(() => undefined);
    throw erreur;
  }

  // Notifications : jamais bloquantes (Resend indisponible, adresse invalide...),
  // le candidat a bien postulé quoi qu'il arrive. Le contenu saisi par le
  // candidat est échappé par corpsVersHtml().
  const lien = `${process.env.BETTER_AUTH_URL ?? "http://localhost:3000"}/app/recrutement`;
  const detail = [`Poste : ${poste.titre}`, `Nom : ${nom}`, `Téléphone : ${telephone}`, email ? `Email : ${email}` : null, message ? `Message : ${message}` : null]
    .filter((ligne): ligne is string => ligne !== null)
    .join("\n");
  for (const destinataire of destinatairesAdmin) {
    await envoyerEmail({
      to: destinataire,
      subject: `Nouvelle candidature — ${poste.titre}`,
      html: corpsVersHtml(`Vous avez reçu une nouvelle candidature.\n\n${detail}\n\nConsultez-la dans One Recruit : ${lien}`),
    }).catch(() => undefined);
  }
  if (email) {
    await envoyerEmail({
      to: email,
      subject: `Votre candidature chez ${params.nomEntreprise} a bien été reçue`,
      html: corpsVersHtml(
        `Bonjour ${nom},\n\nMerci pour votre candidature au poste « ${poste.titre} » chez ${params.nomEntreprise}. Nous l'avons bien reçue et reviendrons vers vous rapidement.\n\nÀ très bientôt !`
      ),
    }).catch(() => undefined);
  }

  return { succes: true, prenom: nom.split(/\s+/)[0] };
}
