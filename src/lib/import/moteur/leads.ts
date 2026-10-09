import { eq } from "drizzle-orm";
import { lead } from "@/db/schema";
import { normaliser } from "../valeurs";
import { m } from "@/lib/i18n/catalogue";
import {
  avertir,
  avertirResponsablesInconnus,
  chiffresTelephone,
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

type StatutLead = "NOUVEAU" | "CONTACTE" | "QUALIFIE" | "DISQUALIFIE";

/** « Disqualifié » est testé avant « qualifié » (il le contient) ; tout ce qui n'est pas reconnu reste « Nouveau ». */
export function statutLeadDepuisTexte(brut: string | undefined): StatutLead {
  const s = normaliser(brut ?? "");
  if (/\b(disqualifie|disqualified|unqualified|not qualified|non qualifie|pas qualifie|junk|lost lead|perdu|lost)\b/.test(s)) return "DISQUALIFIE";
  if (/\b(qualifie|qualified)\b/.test(s)) return "QUALIFIE";
  if (/\b(contacte|contacted|attempted to contact|contact in future|working|en cours|appele)\b/.test(s)) return "CONTACTE";
  return "NOUVEAU";
}

/**
 * Leads (autre espace Vertex One, Zoho CRM…) : un lead dont l'email ou le téléphone existe déjà — dans l'application ou plus haut
 * dans ce fichier — est ignoré. Le statut est repris ; la date de création, elle, est celle de l'import.
 */
export async function importerLeads(ctx: ContexteImport, lignes: LigneImport[]): Promise<Rapport> {
  const { tx, entrepriseId } = ctx;
  const rapport = nouveauRapport();

  const existants = await tx.select({ nom: lead.nom, email: lead.email, telephone: lead.telephone }).from(lead).where(eq(lead.entrepriseId, entrepriseId));
  const emailsVus = new Set(existants.map((l) => (l.email ?? "").toLowerCase()).filter(Boolean));
  const telephonesVus = new Set(existants.map((l) => chiffresTelephone(l.telephone)).filter(Boolean));
  // Sans email ni téléphone, seul le nom permet de reconnaître un lead déjà importé (sinon rejouer un fichier le dupliquerait).
  const nomsSansCoordonnees = new Set(existants.filter((l) => !l.email && !chiffresTelephone(l.telephone)).map((l) => normaliser(l.nom)));

  const aCreer: (typeof lead.$inferInsert)[] = [];
  let sansTelephone = 0;
  let emailsInvalides = 0;

  for (const { numero, v } of lignes) {
    const societe = (v.societe ?? "").trim();
    const nom = [v.prenom, v.nom].map((s) => (s ?? "").trim()).filter(Boolean).join(" ") || societe;
    if (nom.length < 2) {
      erreur(rapport, numero, m("Nom manquant ou trop court."));
      continue;
    }
    let email: string | null = (v.email ?? "").trim().toLowerCase() || null;
    if (email && !EMAIL_VALIDE.test(email)) {
      emailsInvalides++;
      email = null;
    }
    const telBrut = (v.telephone ?? "").trim();
    const tel = chiffresTelephone(telBrut);
    const sansCoordonnees = !email && !tel;
    if ((email && emailsVus.has(email)) || (tel && telephonesVus.has(tel)) || (sansCoordonnees && nomsSansCoordonnees.has(normaliser(nom)))) {
      rapport.ignores++;
      continue;
    }
    if (email) emailsVus.add(email);
    if (tel) telephonesVus.add(tel);
    if (sansCoordonnees) nomsSansCoordonnees.add(normaliser(nom));
    if (!telBrut) sansTelephone++;

    aCreer.push({
      entrepriseId,
      nom,
      societeCliente: societe && societe !== nom ? societe : null,
      telephone: telBrut || TELEPHONE_ABSENT,
      email,
      statut: statutLeadDepuisTexte(v.statut),
      notes: (v.notes ?? "").trim() || null,
      assigneAId: resoudreResponsableDeFichier(ctx, v.proprietaire),
    });
  }

  for (const lot of lots(aCreer)) await tx.insert(lead).values(lot);
  rapport.crees = aCreer.length;

  if (sansTelephone > 0) avertir(rapport, 0, m("{n} lead(s) sans téléphone : « {absent} » a été inscrit, à compléter."), { n: sansTelephone, absent: TELEPHONE_ABSENT });
  if (emailsInvalides > 0) avertir(rapport, 0, m("{n} adresse(s) email invalide(s) ignorée(s)."), { n: emailsInvalides });
  avertirResponsablesInconnus(ctx, rapport);
  return rapport;
}
