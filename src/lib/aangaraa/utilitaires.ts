import type { MoyenPaiementEnLigne, ResultatVerification, StatutPaiement } from "@/lib/paiement/types";

/**
 * Logique pure du module Aangaraa Pay — isolée de src/lib/aangaraa/client.ts (qui importe "server-only") pour rester
 * testable directement en Vitest.
 */

/**
 * SUCCESSFUL est le seul succès. Un lien expiré (4 minutes), annulé ou refusé est un échec définitif de CETTE tentative (le
 * client en relance une nouvelle) ; PENDING attend le client ; tout autre texte est inconnu — jamais pris pour un succès.
 */
export function mapperStatut(statut: unknown): StatutPaiement {
  if (typeof statut !== "string") return "INCONNU";
  switch (statut.toUpperCase()) {
    case "SUCCESSFUL":
      return "ACCEPTED";
    case "FAILED":
    case "CANCELLED":
    case "EXPIRED":
      return "REFUSED";
    case "PENDING":
      return "PENDING";
    default:
      return "INCONNU";
  }
}

/** Opérateur en toutes lettres (« Orange_Cameroon », « MTN_Cameroon », « CARTE ») → enum moyenPaiement existant, jamais une valeur ad hoc. */
export function moyenPaiementDepuisOperateur(operateur: string | undefined): MoyenPaiementEnLigne {
  const o = operateur ?? "";
  if (/orange/i.test(o)) return "orange_money";
  if (/mtn/i.test(o)) return "mtn_momo";
  if (/carte|card|stripe/i.test(o)) return "virement"; // même compte bancaire (512000) que le Mobile Money
  return "mtn_momo";
}

/** Masque la clé d'application dans un texte à consigner : les messages d'erreur de l'API la RÉPÈTENT (« Service with app_key … not found »). */
export function masquerCle(texte: string, cle: string | undefined): string {
  return cle ? texte.split(cle).join("***") : texte;
}

const PAY_TOKEN = /^[A-Za-z0-9_.:-]{6,128}$/;

/**
 * `payToken` d'une notification (le nom varie : « paytoken » dans la charge du webhook, « payToken » ailleurs dans l'API).
 * Ne sert qu'à SAVOIR QUOI relire chez le prestataire — jamais cru — d'où la validation stricte du format : une valeur
 * arbitraire ne part jamais vers son API.
 */
export function lirePayToken(source: Record<string, unknown> | null | undefined): string | null {
  for (const cle of ["paytoken", "payToken", "pay_token", "PayToken"]) {
    const v = source?.[cle];
    if (typeof v === "string" && PAY_TOKEN.test(v)) return v;
  }
  return null;
}

/** L'adresse renvoyée pour la page de paiement est relative (« /payment?id=… ») : complétée par l'adresse de la page, jamais celle de l'API. */
export function urlPaiementAbsolue(paymentUrl: string, urlPage: string): string | null {
  try {
    const url = new URL(paymentUrl, urlPage.endsWith("/") ? urlPage : `${urlPage}/`);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Lit la réponse de `/aangaraa_check_status`. Le format exact de l'enveloppe n'est documenté qu'en partie (les champs sont
 * listés, pas leur emplacement) : on cherche à la racine puis sous `data`. Un statut introuvable donne INCONNU — jamais un
 * succès : en cas de doute, rien n'est confirmé.
 */
export function analyserReponseStatut(corps: unknown): Omit<ResultatVerification, "indisponible"> {
  const racine = corps && typeof corps === "object" ? (corps as Record<string, unknown>) : {};
  const donnees = racine.data && typeof racine.data === "object" ? (racine.data as Record<string, unknown>) : {};
  const champ = (cle: string) => donnees[cle] ?? racine[cle];

  const montant = Number(champ("amount"));
  const reference = champ("transaction_id");
  const operateur = champ("operator");
  return {
    statut: mapperStatut(champ("status")),
    referenceExterne: typeof reference === "string" ? reference : undefined,
    montant: Number.isFinite(montant) ? Math.round(montant) : undefined,
    operateur: typeof operateur === "string" ? operateur : undefined,
  };
}
