import { eq } from "drizzle-orm";
import { contact, deal, historiqueStatutDeal } from "@/db/schema";
import { date, montant, normaliser } from "../valeurs";
import { m } from "@/lib/i18n/catalogue";
import {
  avertir,
  avertirResponsablesInconnus,
  chiffresTelephone,
  compter,
  EMAIL_VALIDE,
  erreur,
  lots,
  nouveauRapport,
  resoudreResponsableDeFichier,
  TELEPHONE_ABSENT,
  type ContexteImport,
  type LigneImport,
  type Rapport,
} from "./commun";

type StatutDeal = "QUALIFICATION" | "PROPOSITION" | "NEGOCIATION" | "GAGNE" | "PERDU";

/** Étapes de Vertex One et de Zoho CRM : « Closed Lost » est testé avant « Closed Won » ; le reste, jusqu'à la proposition, vaut « Qualification ». */
export function statutDealDepuisTexte(brut: string | undefined): StatutDeal {
  const s = normaliser(brut ?? "");
  if (/\b(perdu|lost|closed lost|echec|abandonne)\b/.test(s)) return "PERDU";
  if (/\b(gagne|won|closed won|signe)\b/.test(s)) return "GAGNE";
  if (/\b(negociation|negotiation|negotiation review|review)\b/.test(s)) return "NEGOCIATION";
  if (/\b(proposition|proposal|price quote|devis|value proposition)\b/.test(s)) return "PROPOSITION";
  return "QUALIFICATION";
}

type ContactConnu = { id: string; compteId: string | null };

/**
 * Deals (autre espace Vertex One, Zoho CRM…). Le contact est retrouvé par email, puis téléphone, puis nom ; s'il n'existe pas il est
 * créé (un deal exige un contact), et le rapport le signale. Un deal de même titre pour le même contact est ignoré.
 */
export async function importerDeals(ctx: ContexteImport, lignes: LigneImport[]): Promise<Rapport> {
  const { tx, entrepriseId, utilisateurId } = ctx;
  const rapport = nouveauRapport();

  const contacts = await tx
    .select({ id: contact.id, compteId: contact.compteId, nom: contact.nom, email: contact.email, telephone: contact.telephone })
    .from(contact)
    .where(eq(contact.entrepriseId, entrepriseId));
  const parEmail = new Map<string, ContactConnu>();
  const parTelephone = new Map<string, ContactConnu>();
  const parNom = new Map<string, ContactConnu>();
  const memoriser = (c: { id: string; compteId: string | null; nom: string; email: string | null; telephone: string }) => {
    const connu = { id: c.id, compteId: c.compteId };
    if (c.email) parEmail.set(c.email.toLowerCase(), connu);
    const tel = chiffresTelephone(c.telephone);
    if (tel) parTelephone.set(tel, connu);
    if (!parNom.has(normaliser(c.nom))) parNom.set(normaliser(c.nom), connu);
  };
  contacts.forEach(memoriser);

  const dealsExistants = await tx.select({ titre: deal.titre, contactId: deal.contactId }).from(deal).where(eq(deal.entrepriseId, entrepriseId));
  const dejaVus = new Set(dealsExistants.map((d) => `${normaliser(d.titre)}|${d.contactId}`));

  let contactsCrees = 0;
  let sansMontant = 0;
  const aCreer: (typeof deal.$inferInsert & { cle: string })[] = [];

  for (const { numero, v } of lignes) {
    const titre = (v.titre ?? "").trim();
    const nomContact = (v.contact ?? "").trim();
    if (titre.length < 2) {
      erreur(rapport, numero, m("Titre du deal manquant ou trop court."));
      continue;
    }
    if (nomContact.length < 2) {
      erreur(rapport, numero, m("Contact manquant pour le deal « {titre} »."), { titre });
      continue;
    }
    const email = (v.contactEmail ?? "").trim().toLowerCase();
    const telBrut = (v.contactTelephone ?? "").trim();
    const tel = chiffresTelephone(telBrut);

    let connu = (email && parEmail.get(email)) || (tel && parTelephone.get(tel)) || parNom.get(normaliser(nomContact)) || null;
    if (!connu) {
      const [cree] = await tx
        .insert(contact)
        .values({
          entrepriseId,
          nom: nomContact,
          email: email && EMAIL_VALIDE.test(email) ? email : null,
          telephone: telBrut || TELEPHONE_ABSENT,
          assigneAId: resoudreResponsableDeFichier(ctx, v.proprietaire),
        })
        .returning({ id: contact.id, compteId: contact.compteId, nom: contact.nom, email: contact.email, telephone: contact.telephone });
      memoriser(cree);
      connu = { id: cree.id, compteId: cree.compteId };
      contactsCrees++;
    }

    const cle = `${normaliser(titre)}|${connu.id}`;
    if (dejaVus.has(cle)) {
      rapport.ignores++;
      continue;
    }
    dejaVus.add(cle);

    const mont = montant(v.montant);
    if (mont === null) sansMontant++;
    if ((mont ?? 0) < 0) {
      erreur(rapport, numero, m("Montant négatif pour le deal « {titre} »."), { titre });
      continue;
    }

    aCreer.push({
      cle,
      entrepriseId,
      titre,
      montant: mont ?? 0,
      contactId: connu.id,
      compteId: connu.compteId,
      statut: statutDealDepuisTexte(v.statut),
      dateClotureEstimee: date(v.dateCloture),
      assigneAId: resoudreResponsableDeFichier(ctx, v.proprietaire),
    });
  }

  for (const lot of lots(aCreer)) {
    const crees = await tx
      .insert(deal)
      .values(lot.map(({ cle: _cle, ...valeurs }) => valeurs))
      .returning({ id: deal.id, statut: deal.statut });
    // Premier point de la chronologie du deal, comme à la création normale (ancienStatut nul = création).
    await tx.insert(historiqueStatutDeal).values(crees.map((d) => ({ entrepriseId, dealId: d.id, ancienStatut: null, nouveauStatut: d.statut, modifieParId: utilisateurId })));
  }
  rapport.crees = aCreer.length;

  compter(rapport, m("Contacts créés"), contactsCrees);
  if (contactsCrees > 0) avertir(rapport, 0, m("{n} contact(s) absent(s) de votre CRM ont été créés pour recevoir leurs deals."), { n: contactsCrees });
  if (sansMontant > 0) avertir(rapport, 0, m("{n} deal(s) sans montant : montant mis à 0, à compléter."), { n: sansMontant });
  avertirResponsablesInconnus(ctx, rapport);
  return rapport;
}
