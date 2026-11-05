import type { MoyenPaiementEnLigne, RaisonEchec, ResultatVerification, StatutPaiement } from "@/lib/paiement/types";

/**
 * Logique pure du module ElyonPay — isolée de src/lib/elyonpay/client.ts (qui importe "server-only") pour rester testable
 * directement en Vitest. Documentation : https://docs.elyonpay.com/fr/documentation/
 */

/** Opérateurs proposés au payeur dans notre interface (jamais devinés depuis le numéro) → code `payment_method` d'ElyonPay. */
export type OperateurMobileMoney = "MTN_Cameroon" | "Orange_Cameroon";

export function operateurValide(valeur: unknown): valeur is OperateurMobileMoney {
  return valeur === "MTN_Cameroon" || valeur === "Orange_Cameroon";
}

/**
 * La documentation d'ElyonPay est incohérente sur ces codes (exemples en `ORANGE_MONEY` / `MTN_MONEY`, tableau en `orange_money` /
 * `mtn_mobile_money`) : on prend ceux des exemples ET de la réponse de `GET /public/configuration/payments/CM`. À confirmer par un essai
 * réel ; modifiables par ELYONPAY_METHODE_MTN / ELYONPAY_METHODE_ORANGE sans toucher au code.
 */
export function codeMethodePaiement(operateur: OperateurMobileMoney, env: Record<string, string | undefined> = process.env): string {
  if (operateur === "MTN_Cameroon") return env.ELYONPAY_METHODE_MTN?.trim() || "MTN_MONEY";
  return env.ELYONPAY_METHODE_ORANGE?.trim() || "ORANGE_MONEY";
}

/**
 * États d'une transaction ElyonPay. Pour un paiement Mobile Money, « l'argent est encaissé » dès PENDING (qui sera renommé
 * WAITING_FOR_DELIVERY — les deux sont acceptés, comme le demande la documentation) puis DELIVERED : ce sont les seuls succès.
 * CREATED et WAITING_FOR_PAYMENT attendent le payeur. REJECTED, DECLINED, CANCELLED et FAILED sont des échecs définitifs de CETTE
 * tentative (le payeur en relance une nouvelle). Tout autre texte — y compris ACCEPTED, dont la documentation ne dit pas s'il
 * équivaut à « encaissé » — reste INCONNU : rien n'est confirmé en cas de doute, la relecture régulière tranchera.
 */
export function mapperStatut(statut: unknown): StatutPaiement {
  if (typeof statut !== "string") return "INCONNU";
  switch (statut.toUpperCase()) {
    case "PENDING":
    case "WAITING_FOR_DELIVERY":
    case "DELIVERED":
      return "ACCEPTED";
    case "CREATED":
    case "WAITING_FOR_PAYMENT":
      return "PENDING";
    case "REJECTED":
    case "DECLINED":
    case "CANCELLED":
    case "CANCELED":
    case "FAILED":
      return "REFUSED";
    default:
      return "INCONNU";
  }
}

/**
 * Raison d'un échec, déduite de l'état et des textes que la transaction renvoie. Un texte inconnu donne « AUTRE » — jamais une
 * explication inventée.
 */
export function analyserRaisonEchec(statutBrut: unknown, message: unknown): RaisonEchec {
  const statut = typeof statutBrut === "string" ? statutBrut.toUpperCase() : "";
  const texte = (typeof message === "string" ? message : "").toUpperCase();
  if (/LOW_BALANCE|NOT_ENOUGH|INSUFFICIENT|NOT_ALLOWED|PAYER_LIMIT|SOLDE|BALANCE/.test(texte)) return "SOLDE_OU_COMPTE";
  if (/EXPIRE|TIMEOUT|TIMED OUT/.test(texte)) return "EXPIRE";
  if (statut === "CANCELLED" || statut === "CANCELED" || statut === "REJECTED" || statut === "DECLINED" || /CANCEL|REJECT|DECLIN|REFUS/.test(texte)) return "ANNULE";
  return "AUTRE";
}

/** Opérateur en toutes lettres (« MTN », « ORANGE_MONEY », « Orange_Cameroon », « STRIPE ») → enum moyenPaiement existant, jamais une valeur ad hoc. */
export function moyenPaiementDepuisOperateur(operateur: string | undefined): MoyenPaiementEnLigne {
  const o = operateur ?? "";
  if (/orange/i.test(o)) return "orange_money";
  if (/mtn/i.test(o)) return "mtn_momo";
  if (/carte|card|stripe|mollie/i.test(o)) return "virement"; // même compte bancaire (512000) que le Mobile Money
  return "mtn_momo";
}

/** Masque la clé d'API dans un texte à consigner, au cas où un message d'erreur la répète. */
export function masquerCle(texte: string, cle: string | undefined): string {
  return cle ? texte.split(cle).join("***") : texte;
}

const IDENTIFIANT = /^[A-Za-z0-9_.:-]{6,128}$/;

export function identifiantTransactionValide(valeur: unknown): valeur is string {
  return typeof valeur === "string" && IDENTIFIANT.test(valeur);
}

/**
 * Identifiant de transaction ElyonPay (`uuid`, aussi `PSPid`) lu dans la réponse d'un paiement. Il ne sert qu'à RELIRE la transaction
 * chez ElyonPay (`GET /transactions/{uuid}`) : d'où la validation stricte du format — une valeur arbitraire ne part jamais dans une
 * adresse. Le schéma de la réponse d'un paiement Mobile Money n'étant pas documenté, on cherche à la racine puis sous `data`.
 */
export function lireIdentifiantTransaction(corps: unknown): string | null {
  const racine = corps && typeof corps === "object" ? (corps as Record<string, unknown>) : {};
  const donnees = racine.data && typeof racine.data === "object" ? (racine.data as Record<string, unknown>) : {};
  for (const source of [donnees, racine]) {
    for (const cle of ["uuid", "PSPid", "transactionId", "transaction_id", "id"]) {
      const v = source[cle];
      const texte = typeof v === "number" ? String(v) : v;
      if (identifiantTransactionValide(texte)) return texte;
    }
  }
  return null;
}

/**
 * Lit la réponse de `GET /transactions/{uuid}` : `state`, `amount`, `payment.name` (MTN, ORANGE…), `externalId`. Un état introuvable
 * donne INCONNU — jamais un succès. Le montant lu est `amount` (jamais `totalCustomer`, qui peut inclure des frais).
 */
export function analyserReponseTransaction(corps: unknown): Omit<ResultatVerification, "indisponible"> {
  const racine = corps && typeof corps === "object" ? (corps as Record<string, unknown>) : {};
  const donnees = racine.data && typeof racine.data === "object" ? (racine.data as Record<string, unknown>) : racine;
  const etat = donnees.state;
  const statut = mapperStatut(etat);
  const montant = Number(donnees.amount);
  const paiement = donnees.payment && typeof donnees.payment === "object" ? (donnees.payment as Record<string, unknown>) : {};
  const operateur = typeof paiement.name === "string" ? paiement.name : undefined;
  const reference = donnees.externalId;
  const message = [donnees.message, donnees.PSPMessage, donnees.reason].filter((v): v is string => typeof v === "string").join(" ");
  return {
    statut,
    ...(statut === "REFUSED" ? { raisonEchec: analyserRaisonEchec(etat, message) } : {}),
    referenceExterne: typeof reference === "string" ? reference : undefined,
    montant: Number.isFinite(montant) ? Math.round(montant) : undefined,
    operateur,
  };
}
