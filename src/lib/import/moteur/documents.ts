import { eq } from "drizzle-orm";
import { compteClient, contact, devis, facture, ligneDevis, ligneFacture, paiement } from "@/db/schema";
import { calculerMontants } from "@/lib/facturation/calcul";
import { date, decimal, montant, normaliser } from "../valeurs";
import {
  avertir,
  chiffresTelephone,
  compter,
  EMAIL_VALIDE,
  erreur,
  lots,
  nouveauRapport,
  TELEPHONE_ABSENT,
  type ContexteImport,
  type LigneImport,
  type Rapport,
} from "./commun";

const TVA_PAR_DEFAUT = 19.25;
const JOURS_VALIDITE_PAR_DEFAUT = 30;
const MS_JOUR = 86_400_000;

type StatutDevis = "BROUILLON" | "ENVOYE" | "ACCEPTE" | "REFUSE" | "EXPIRE";
type StatutFacture = "EMISE" | "PARTIELLEMENT_PAYEE" | "PAYEE" | "EN_RETARD" | "ANNULEE";

export function statutDevisDepuisTexte(brut: string | undefined): StatutDevis {
  const s = normaliser(brut ?? "");
  if (/\b(accepted|accepte|accepts|approved|approuve|won|gagne)\b/.test(s)) return "ACCEPTE";
  if (/\b(declined|refuse|refused|rejected|rejete|lost|perdu)\b/.test(s)) return "REFUSE";
  if (/\b(expired|expire|expiree)\b/.test(s)) return "EXPIRE";
  if (/\b(draft|brouillon)\b/.test(s)) return "BROUILLON";
  return "ENVOYE";
}

/** `null` = brouillon : une facture n'a pas de numéro tant qu'elle n'est pas émise, un brouillon n'a donc rien à reprendre. */
export function statutFactureDepuisTexte(brut: string | undefined): StatutFacture | "PARTIELLEMENT_PAYEE" | null {
  const s = normaliser(brut ?? "");
  if (/\b(draft|brouillon)\b/.test(s)) return null;
  if (/\b(void|voided|cancelled|canceled|annule|annulee)\b/.test(s)) return "ANNULEE";
  if (/\b(partially paid|partiellement payee|partial|partiel)\b/.test(s)) return "PARTIELLEMENT_PAYEE";
  if (/\b(paid|payee|paye|closed|reglee|regle|solde)\b/.test(s) && !/\b(unpaid|impayee|non payee)\b/.test(s)) return "PAYEE";
  if (/\b(overdue|en retard|late|retard)\b/.test(s)) return "EN_RETARD";
  return "EMISE";
}

type LigneDoc = { designation: string; quantite: number; prixUnitaire: number; tauxTVA: number };
type Document = {
  numeroDoc: string;
  premiereLigne: number;
  client: string;
  clientEmail: string | null;
  clientTelephone: string;
  emission: Date;
  echeance: Date;
  statutBrut: string;
  lignes: LigneDoc[];
  montantPaye: number | null;
  datePaiement: Date | null;
  totalTTCFichier: number | null;
};

/**
 * Devis ou factures d'un ancien outil (Zoho Books…), regroupés par numéro : reprise de l'historique, sans nouvelle
 * numérotation (le numéro d'origine est conservé), sans écriture comptable (l'ancien outil a déjà tenu la comptabilité) —
 * et, pour une facture, jamais supprimable ensuite comme toutes les autres.
 */
export async function importerDocuments(ctx: ContexteImport, genre: "DEVIS" | "FACTURES", lignes: LigneImport[]): Promise<Rapport> {
  const { tx, entrepriseId, utilisateurId } = ctx;
  const rapport = nouveauRapport();
  const estFacture = genre === "FACTURES";
  const mappe = (cle: string) => lignes.some((l) => cle in l.v);
  const tvaMappee = mappe("tauxTVA");

  // 1. Regroupement par numéro (plusieurs lignes = un seul document).
  const groupes = new Map<string, Document>();
  let tvaSupposee = 0;
  for (const { numero, v } of lignes) {
    const numeroDoc = (v.numero ?? "").trim();
    if (!numeroDoc) {
      erreur(rapport, numero, `Numéro de ${estFacture ? "facture" : "devis"} manquant.`);
      continue;
    }
    let doc = groupes.get(numeroDoc);
    if (!doc) {
      const client = (v.client ?? "").trim();
      const emission = date(v.date) ?? new Date();
      const echeance = date(v.echeance) ?? new Date(emission.getTime() + JOURS_VALIDITE_PAR_DEFAUT * MS_JOUR);
      if (client.length < 2) {
        erreur(rapport, numero, `Client manquant ou trop court pour ${numeroDoc}.`);
        continue;
      }
      doc = {
        numeroDoc,
        premiereLigne: numero,
        client,
        clientEmail: (v.clientEmail ?? "").trim().toLowerCase() || null,
        clientTelephone: (v.clientTelephone ?? "").trim(),
        emission,
        echeance,
        statutBrut: v.statut ?? "",
        lignes: [],
        montantPaye: v.montantPaye !== undefined ? montant(v.montantPaye) : null,
        datePaiement: date(v.datePaiement),
        totalTTCFichier: montant(v.totalTTC),
      };
      groupes.set(numeroDoc, doc);
    }

    // Une ligne de détail : quantité × prix unitaire (HT), TVA de la ligne.
    const pu = montant(v.prixUnitaire);
    if (pu !== null) {
      const quantite = decimal(v.quantite) ?? 1;
      let tauxTVA = TVA_PAR_DEFAUT;
      if (tvaMappee) tauxTVA = decimal(v.tauxTVA) ?? 0; // colonne présente mais vide : exonéré
      else tvaSupposee++;
      doc.lignes.push({ designation: (v.designation ?? "").trim() || "Reprise de l'historique", quantite, prixUnitaire: pu, tauxTVA });
    } else if (doc.lignes.length === 0 && (v.totalHT || v.totalTTC)) {
      // Fichier à une ligne par document : seuls les totaux sont connus.
      const ttc = montant(v.totalTTC);
      const ht = montant(v.totalHT);
      const taux = tvaMappee ? (decimal(v.tauxTVA) ?? 0) : TVA_PAR_DEFAUT;
      if (!tvaMappee && ht === null) tvaSupposee++;
      const base = ht ?? (ttc !== null ? Math.round(ttc / (1 + taux / 100)) : null);
      if (base !== null) doc.lignes.push({ designation: (v.designation ?? "").trim() || "Reprise de l'historique", quantite: 1, prixUnitaire: base, tauxTVA: taux });
    }
  }

  // 2. Documents déjà présents (même numéro) : ignorés, jamais écrasés.
  const numerosExistants = new Set(
    estFacture
      ? (await tx.select({ n: facture.numero }).from(facture).where(eq(facture.entrepriseId, entrepriseId))).map((r) => r.n)
      : (await tx.select({ n: devis.numero }).from(devis).where(eq(devis.entrepriseId, entrepriseId))).map((r) => r.n)
  );

  // 3. Clients : retrouvés par email, téléphone puis nom ; créés sinon.
  const contacts = await tx.select({ id: contact.id, nom: contact.nom, email: contact.email, telephone: contact.telephone, compteId: contact.compteId }).from(contact).where(eq(contact.entrepriseId, entrepriseId));
  // Un client d'un ancien outil est souvent une société : on la retrouve parmi les sociétés, et on facture son premier contact.
  const comptes = await tx.select({ id: compteClient.id, nom: compteClient.nom }).from(compteClient).where(eq(compteClient.entrepriseId, entrepriseId));
  const compteParNom = new Map(comptes.map((c) => [normaliser(c.nom), c.id]));
  const premierContactParCompte = new Map<string, string>();
  const compteDuContact = new Map<string, string>();
  for (const c of contacts) {
    if (!c.compteId) continue;
    compteDuContact.set(c.id, c.compteId);
    if (!premierContactParCompte.has(c.compteId)) premierContactParCompte.set(c.compteId, c.id);
  }
  const parEmail = new Map<string, string>();
  const parTelephone = new Map<string, string>();
  const parNom = new Map<string, string>();
  for (const c of contacts) {
    if (c.email) parEmail.set(c.email.toLowerCase(), c.id);
    const t = chiffresTelephone(c.telephone);
    if (t) parTelephone.set(t, c.id);
    parNom.set(normaliser(c.nom), c.id);
  }
  const trouverClient = (d: Document): string | undefined => {
    const compteCite = compteParNom.get(normaliser(d.client));
    return (
      (d.clientEmail ? parEmail.get(d.clientEmail) : undefined) ??
      parTelephone.get(chiffresTelephone(d.clientTelephone)) ??
      parNom.get(normaliser(d.client)) ??
      (compteCite ? premierContactParCompte.get(compteCite) : undefined)
    );
  };

  const retenus: Document[] = [];
  let ecartsTotaux = 0;
  for (const d of groupes.values()) {
    if (numerosExistants.has(d.numeroDoc)) {
      rapport.ignores++;
      continue;
    }
    if (estFacture && statutFactureDepuisTexte(d.statutBrut) === null) {
      rapport.ignores++;
      avertir(rapport, d.premiereLigne, `${d.numeroDoc} est un brouillon : une facture n'a pas de numéro tant qu'elle n'est pas émise, elle n'est pas reprise.`);
      continue;
    }
    if (d.lignes.length === 0) {
      erreur(rapport, d.premiereLigne, `Aucun montant pour ${d.numeroDoc} (ni ligne détaillée, ni total).`);
      continue;
    }
    if (d.totalTTCFichier !== null) {
      const calcule = calculerMontants(d.lignes).montantTTC;
      if (Math.abs(calcule - d.totalTTCFichier) > 1) {
        ecartsTotaux++;
        if (ecartsTotaux <= 20) avertir(rapport, d.premiereLigne, `${d.numeroDoc} : le total du fichier (${d.totalTTCFichier}) diffère de la somme des lignes (${calcule}) — remise ou frais ? Le total des lignes est retenu.`);
      }
    }
    retenus.push(d);
  }

  const nouveauxClients = new Map<string, Document>();
  for (const d of retenus) {
    if (trouverClient(d)) continue;
    const cle = normaliser(d.client);
    if (!nouveauxClients.has(cle)) nouveauxClients.set(cle, d);
  }
  for (const lot of lots([...nouveauxClients.values()])) {
    const crees = await tx
      .insert(contact)
      .values(
        lot.map((d) => ({
          entrepriseId,
          nom: d.client,
          telephone: d.clientTelephone || TELEPHONE_ABSENT,
          email: d.clientEmail && EMAIL_VALIDE.test(d.clientEmail) ? d.clientEmail : null,
          notes: `Créé par l'import de ${estFacture ? "factures" : "devis"}.`,
          assigneAId: utilisateurId,
        }))
      )
      .returning({ id: contact.id, nom: contact.nom });
    for (const c of crees) parNom.set(normaliser(c.nom), c.id);
  }

  // 4. Écriture des documents, puis de leurs lignes et règlements.
  const entetes = retenus.map((d) => {
    const { montantHT, montantTVA, montantTTC } = calculerMontants(d.lignes);
    const contactId = trouverClient(d)!;
    return { d, montantHT, montantTVA, montantTTC, contactId, compteId: compteDuContact.get(contactId) ?? null };
  });

  if (estFacture) {
    let paiementsInconnus = 0;
    for (const lot of lots(entetes)) {
      const valeurs = lot.map((e) => {
        const brut = statutFactureDepuisTexte(e.d.statutBrut)!;
        let statut: StatutFacture = brut === "PARTIELLEMENT_PAYEE" ? "PARTIELLEMENT_PAYEE" : brut;
        const paye = e.d.montantPaye ?? 0;
        if (statut !== "ANNULEE" && e.montantTTC > 0 && paye >= e.montantTTC) statut = "PAYEE";
        else if (statut === "PARTIELLEMENT_PAYEE" && !(paye > 0)) {
          statut = "EMISE"; // « partiellement payée » sans montant : on ne devine pas
          paiementsInconnus++;
        }
        return { e, statut };
      });
      const crees = await tx
        .insert(facture)
        .values(
          valeurs.map(({ e, statut }) => ({
            entrepriseId,
            numero: e.d.numeroDoc,
            contactId: e.contactId,
            compteId: e.compteId,
            assigneAId: utilisateurId,
            statut,
            montantHT: e.montantHT,
            montantTVA: e.montantTVA,
            montantTTC: e.montantTTC,
            dateEmission: e.d.emission,
            dateEcheance: e.d.echeance,
          }))
        )
        .returning({ id: facture.id, numero: facture.numero });
      const idParNumero = new Map(crees.map((c) => [c.numero, c.id]));
      const lignesAInserer = valeurs.flatMap(({ e }) => e.d.lignes.map((l) => ({ entrepriseId, factureId: idParNumero.get(e.d.numeroDoc)!, designation: l.designation, quantite: l.quantite, prixUnitaire: l.prixUnitaire, tauxTVA: l.tauxTVA })));
      for (const l of lots(lignesAInserer)) await tx.insert(ligneFacture).values(l);

      const reglements = valeurs.flatMap(({ e, statut }) => {
        if (statut !== "PAYEE" && statut !== "PARTIELLEMENT_PAYEE") return [];
        const montantRegle = statut === "PAYEE" ? e.montantTTC : (e.d.montantPaye ?? 0);
        if (montantRegle <= 0) return [];
        return [{ entrepriseId, factureId: idParNumero.get(e.d.numeroDoc)!, montant: montantRegle, moyenPaiement: "manuel" as const, saisiParId: utilisateurId, datePaiement: e.d.datePaiement ?? e.d.emission }];
      });
      for (const r of lots(reglements)) await tx.insert(paiement).values(r);
    }
    if (paiementsInconnus > 0) avertir(rapport, 0, `${paiementsInconnus} facture(s) « partiellement payée(s) » sans montant payé : reprises comme émises, à pointer à la main.`);
  } else {
    for (const lot of lots(entetes)) {
      const crees = await tx
        .insert(devis)
        .values(
          lot.map((e) => ({
            entrepriseId,
            numero: e.d.numeroDoc,
            contactId: e.contactId,
            compteId: e.compteId,
            assigneAId: utilisateurId,
            statut: statutDevisDepuisTexte(e.d.statutBrut),
            dateValidite: e.d.echeance,
            montantHT: e.montantHT,
            montantTVA: e.montantTVA,
            montantTTC: e.montantTTC,
            creeParId: utilisateurId,
            creeLe: e.d.emission,
          }))
        )
        .returning({ id: devis.id, numero: devis.numero });
      const idParNumero = new Map(crees.map((c) => [c.numero, c.id]));
      const lignesAInserer = lot.flatMap((e) => e.d.lignes.map((l) => ({ entrepriseId, devisId: idParNumero.get(e.d.numeroDoc)!, designation: l.designation, quantite: l.quantite, prixUnitaire: l.prixUnitaire, tauxTVA: l.tauxTVA })));
      for (const l of lots(lignesAInserer)) await tx.insert(ligneDevis).values(l);
    }
  }
  rapport.crees = retenus.length;

  compter(rapport, "Clients créés", nouveauxClients.size);
  if (tvaSupposee > 0) avertir(rapport, 0, `Aucune colonne de TVA associée : un taux de ${String(TVA_PAR_DEFAUT).replace(".", ",")} % a été supposé. Associez la colonne de TVA si vos documents en portent une.`);
  if (ecartsTotaux > 20) avertir(rapport, 0, `${ecartsTotaux} documents au total ont un total différent de la somme de leurs lignes.`);
  return rapport;
}
