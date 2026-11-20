"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { avecEntreprise } from "@/db/client";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { verifierIdentifiants } from "@/lib/elyonpay/client";
import { enregistrerCompte, paiementEnCours, supprimerCompte } from "@/lib/paiement/compte-elyonpay";
import { getT } from "@/lib/i18n/langue";
import { m } from "@/lib/i18n/catalogue";

export type EtatCompteElyonpay = { erreur?: string; ok?: boolean } | null;

const schemaCompte = z.object({
  marchandId: z.string().trim().regex(/^\d{1,9}$/, m("L'identifiant marchand est un nombre (ex. 595).")),
  nomMarchand: z.string().trim().min(2, m("Le nom affiché au payeur est trop court.")).max(60, m("Le nom affiché au payeur est trop long (60 caractères au plus).")),
  cle: z
    .string()
    .trim()
    .min(16, m("La clé d'API est trop courte : copiez-la en entier depuis votre tableau de bord ElyonPay."))
    .max(500, m("La clé d'API est trop longue."))
    .regex(/^\S+$/, m("La clé d'API ne doit contenir ni espace ni retour à la ligne.")),
});

function revalider() {
  revalidatePath("/app/parametres/paiement-mobile-money");
  revalidatePath("/app/facturation", "layout");
}

/**
 * Brancher (ou remplacer) le compte ElyonPay de l'entreprise : les paiements Mobile Money de ses clients iront DIRECTEMENT sur ce compte, Vertex One ne les détient jamais.
 * Réservé à qui peut modifier les paramètres. La clé est TESTÉE auprès d'ElyonPay avant d'être gardée (une clé refusée n'est jamais enregistrée), puis chiffrée ; elle n'est
 * jamais renvoyée au navigateur ni écrite dans un message d'erreur. L'identifiant marchand ne peut pas être vérifié sans payer : il est validé au premier paiement.
 * Tant qu'un paiement est en cours sur le compte actuel, on ne le change pas (sa relecture exige l'ancienne clé).
 */
export async function connecterCompteElyonpay(_etat: EtatCompteElyonpay, formData: FormData): Promise<EtatCompteElyonpay> {
  const t = await getT();
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte, "PARAMETRES", "MODIFIER")) return { erreur: t("Seul l'Administrateur peut brancher le compte de paiement.") };

  const analyse = schemaCompte.safeParse({ marchandId: formData.get("marchandId"), nomMarchand: formData.get("nomMarchand"), cle: formData.get("cle") });
  if (!analyse.success) return { erreur: t(analyse.error.issues[0]?.message ?? m("Formulaire invalide.")) };
  const d = analyse.data;

  const enCours = await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) => paiementEnCours(tx, utilisateurConnecte.entrepriseId));
  if (enCours) return { erreur: t("Un paiement est en cours : attendez quelques minutes qu'il se termine avant de changer de compte.") };

  // Appel réseau HORS de toute transaction.
  const verification = await verifierIdentifiants({ cle: d.cle, marchandId: Number(d.marchandId), nomMarchand: d.nomMarchand });
  if (!verification.valide) {
    return {
      erreur: verification.refusee
        ? t("ElyonPay a refusé cette clé d'API. Vérifiez que vous avez copié la clé de PRODUCTION en entier, ou régénérez-la dans votre tableau de bord ElyonPay.")
        : t("Impossible de joindre ElyonPay pour vérifier la clé. Réessayez dans un instant."),
    };
  }

  await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) =>
    enregistrerCompte(tx, { entrepriseId: utilisateurConnecte.entrepriseId, marchandId: Number(d.marchandId), nomMarchand: d.nomMarchand, cle: d.cle, creeParId: utilisateurConnecte.utilisateurId }),
  );

  revalider();
  return { ok: true };
}

/** Retirer le compte ElyonPay de l'entreprise : le paiement en ligne n'est plus proposé à ses clients (le pointage manuel reste possible). */
export async function deconnecterCompteElyonpay(): Promise<EtatCompteElyonpay> {
  const t = await getT();
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte, "PARAMETRES", "MODIFIER")) return { erreur: t("Seul l'Administrateur peut retirer le compte de paiement.") };

  const resultat = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx): Promise<EtatCompteElyonpay> => {
    if (await paiementEnCours(tx, utilisateurConnecte.entrepriseId)) return { erreur: t("Un paiement est en cours : attendez quelques minutes qu'il se termine avant de retirer le compte.") };
    await supprimerCompte(tx, utilisateurConnecte.entrepriseId);
    return { ok: true };
  });

  revalider();
  return resultat;
}
