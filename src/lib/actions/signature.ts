"use server";

import { z } from "zod";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { generateRandomString } from "better-auth/crypto";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, document, demandeSignature, signataire } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { disponible } from "@/lib/plans";
import { lireObjetStockage } from "@/lib/documents/stockage";
import { calculerEmpreinteDocument } from "@/lib/signature/empreinte";
import { genererCodeVerification, hacherCodeVerification, verifierCodeVerification } from "@/lib/signature/otp";
import { envoyerEmail } from "@/lib/email/client";

function urlBase(): string {
  return process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
}

const schemaCreationDemande = z.object({
  documentId: z.string(),
  nom: z.string().trim().min(2, "Le nom du signataire est requis."),
  telephone: z.string().trim().min(8, "Le numéro de téléphone est requis."),
  email: z.email("Adresse email invalide.").optional().or(z.literal("")),
});

export type EtatDemandeSignature = { erreur?: string; succes?: string } | null;

/**
 * MVP à un seul signataire par demande (docs/palier-4-*, section 2 modélise
 * plusieurs Signataire par DemandeSignature, mais le cas dominant — devis ou
 * contrat à faire signer par un client — n'en a besoin que d'un ; le modèle
 * de données n'empêche pas d'en ajouter davantage plus tard).
 */
export async function creerDemandeSignature(_etat: EtatDemandeSignature, formData: FormData): Promise<EtatDemandeSignature> {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte.role, "SIGNATURE", "CREER")) {
    return { erreur: "Vous n'avez pas le droit de demander une signature." };
  }

  const analyse = schemaCreationDemande.safeParse({
    documentId: formData.get("documentId"),
    nom: formData.get("nom"),
    telephone: formData.get("telephone"),
    email: formData.get("email") || "",
  });
  if (!analyse.success) {
    return { erreur: analyse.error.issues[0]?.message ?? "Formulaire invalide." };
  }
  const { documentId, nom, telephone, email } = analyse.data;

  type Resultat =
    | { erreur: string }
    | { jetonAcces: string; nomDocument: string; contenu: Buffer };

  const resultat: Resultat = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [monEntreprise] = await tx.select().from(entreprise).where(eq(entreprise.id, utilisateurConnecte.entrepriseId));
    if (!disponible(monEntreprise, "SIGNATURE_ELECTRONIQUE")) {
      return { erreur: "La signature électronique est disponible à partir du forfait Business." };
    }

    const [leDocument] = await tx.select().from(document).where(eq(document.id, documentId));
    if (!leDocument) return { erreur: "Document introuvable." };

    const contenu = await lireObjetStockage(leDocument.cleStockage);
    if (!contenu) {
      return { erreur: "Impossible de lire le contenu du document (stockage R2 non configuré ou fichier introuvable)." };
    }

    const empreinteDocument = calculerEmpreinteDocument(contenu);

    const [demande] = await tx
      .insert(demandeSignature)
      .values({
        entrepriseId: utilisateurConnecte.entrepriseId,
        documentId,
        empreinteDocument,
        creeParId: utilisateurConnecte.utilisateurId,
      })
      .returning({ id: demandeSignature.id });

    const jetonAcces = generateRandomString(32, "a-z", "A-Z", "0-9");

    await tx.insert(signataire).values({
      entrepriseId: utilisateurConnecte.entrepriseId,
      demandeSignatureId: demande.id,
      nom,
      telephone,
      email: email || undefined,
      jetonAcces,
    });

    return { jetonAcces, nomDocument: leDocument.nom, contenu };
  });

  if ("erreur" in resultat) return resultat;

  const { jetonAcces, nomDocument, contenu } = resultat;
  const lienSignature = `${urlBase()}/signature/${jetonAcces}`;

  if (email) {
    const { envoye, erreur } = await envoyerEmail({
      to: email,
      subject: `Signature demandée : ${nomDocument}`,
      html: `<p>Bonjour ${nom},</p><p>Vous êtes invité(e) à signer le document « ${nomDocument} ».</p><p><a href="${lienSignature}">Consulter et signer le document</a></p>`,
      attachments: [{ filename: nomDocument, content: contenu }],
    });
    if (!envoye) {
      revalidatePath("/app/documents");
      return { erreur: `Demande créée, mais l'email n'a pas pu être envoyé (${erreur}). Lien : ${lienSignature}` };
    }
  }

  revalidatePath("/app/documents");
  return {
    succes: email
      ? `Demande de signature envoyée par email à ${nom}.`
      : `Demande créée — aucun email renseigné, transmettez ce lien vous-même : ${lienSignature}`,
  };
}

export type EtatCodeVerification = { erreur?: string; succes?: string } | null;

/**
 * Le canal prévu par docs/palier-4-*, section 2 est WhatsApp/SMS sur le
 * numéro déclaré — non implémenté (API Cloud WhatsApp Business non
 * configurée, voir src/lib/facturation/relance.ts pour le même traitement).
 * Repli MVP documenté : envoi par email, qui exige donc un email renseigné
 * pour ce signataire tant que le canal WhatsApp/SMS n'est pas branché.
 */
export async function envoyerCodeVerificationSignature(_etat: EtatCodeVerification, formData: FormData): Promise<EtatCodeVerification> {
  const jeton = String(formData.get("jeton") ?? "");
  const [leSignataire] = await db.select().from(signataire).where(eq(signataire.jetonAcces, jeton));
  if (!leSignataire) return { erreur: "Lien de signature invalide." };
  if (leSignataire.statut !== "EN_ATTENTE") return { erreur: "Cette signature a déjà été traitée." };
  if (!leSignataire.email) {
    return {
      erreur:
        "Aucune adresse email enregistrée pour l'envoi du code — l'envoi par WhatsApp/SMS n'est pas encore disponible.",
    };
  }

  const code = genererCodeVerification();
  const codeVerificationHash = await hacherCodeVerification(code);

  await avecEntreprise(leSignataire.entrepriseId, (tx) =>
    tx
      .update(signataire)
      .set({ codeVerificationHash, codeVerificationEnvoye: true })
      .where(eq(signataire.id, leSignataire.id))
  );

  const { envoye, erreur } = await envoyerEmail({
    to: leSignataire.email,
    subject: "Votre code de vérification pour signer",
    html: `<p>Votre code de vérification est : <strong style="font-size:1.5em">${code}</strong></p><p>Il vous sera demandé sur la page de signature.</p>`,
  });

  if (!envoye) return { erreur: erreur ?? "Échec de l'envoi du code." };
  return { succes: "Code de vérification envoyé par email." };
}

const schemaConfirmation = z.object({
  jeton: z.string(),
  code: z.string().trim().min(6, "Le code doit contenir 6 chiffres.").max(6, "Le code doit contenir 6 chiffres."),
  consentement: z.string().refine((v) => v === "on", "Vous devez donner votre consentement explicite pour signer."),
});

export type EtatConfirmationSignature = { erreur?: string; succes?: boolean } | null;

/**
 * Le faisceau de preuves qui donne sa valeur probatoire à la signature
 * simple (docs/palier-4-*, section 2) : code OTP vérifié, consentement
 * explicite coché, heure, adresse IP et user-agent enregistrés côté serveur
 * — jamais transmis par le client.
 */
export async function confirmerSignature(_etat: EtatConfirmationSignature, formData: FormData): Promise<EtatConfirmationSignature> {
  const analyse = schemaConfirmation.safeParse({
    jeton: formData.get("jeton"),
    code: formData.get("code"),
    consentement: formData.get("consentement"),
  });
  if (!analyse.success) {
    return { erreur: analyse.error.issues[0]?.message ?? "Formulaire invalide." };
  }
  const { jeton, code } = analyse.data;

  const [leSignataire] = await db.select().from(signataire).where(eq(signataire.jetonAcces, jeton));
  if (!leSignataire) return { erreur: "Lien de signature invalide." };
  if (leSignataire.statut !== "EN_ATTENTE") return { erreur: "Cette signature a déjà été traitée." };
  if (!leSignataire.codeVerificationEnvoye || !leSignataire.codeVerificationHash) {
    return { erreur: "Demandez d'abord un code de vérification." };
  }

  const valide = await verifierCodeVerification(code, leSignataire.codeVerificationHash);
  if (!valide) return { erreur: "Code de vérification incorrect." };

  const enTetes = await headers();
  const adresseIP = enTetes.get("x-forwarded-for")?.split(",")[0]?.trim() ?? enTetes.get("x-real-ip") ?? null;
  const navigateurUtilisateur = enTetes.get("user-agent");

  await avecEntreprise(leSignataire.entrepriseId, async (tx) => {
    await tx
      .update(signataire)
      .set({
        statut: "SIGNE",
        signeLe: new Date(),
        adresseIP,
        navigateurUtilisateur,
        consentementExplicite: true,
      })
      .where(eq(signataire.id, leSignataire.id));

    const tousLesSignataires = await tx
      .select({ statut: signataire.statut })
      .from(signataire)
      .where(eq(signataire.demandeSignatureId, leSignataire.demandeSignatureId));

    const tousSignes = tousLesSignataires.every((s) => s.statut === "SIGNE");
    if (tousSignes) {
      await tx
        .update(demandeSignature)
        .set({ statut: "SIGNE" })
        .where(eq(demandeSignature.id, leSignataire.demandeSignatureId));
    }
  });

  revalidatePath(`/signature/${jeton}`);
  return { succes: true };
}
