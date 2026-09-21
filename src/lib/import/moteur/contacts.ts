import { eq } from "drizzle-orm";
import { compteClient, contact } from "@/db/schema";
import { normaliser } from "../valeurs";
import {
  avertir,
  avertirResponsablesInconnus,
  chiffresTelephone,
  compter,
  EMAIL_VALIDE,
  erreur,
  lots,
  nouveauRapport,
  resoudreResponsable,
  TELEPHONE_ABSENT,
  type ContexteImport,
  type LigneImport,
  type Rapport,
} from "./commun";

/** Contacts (Zoho CRM/Books, carnet d'adresses) : la société citée est créée si besoin, un doublon (email ou téléphone) est ignoré. */
export async function importerContacts(ctx: ContexteImport, lignes: LigneImport[]): Promise<Rapport> {
  const { tx, entrepriseId } = ctx;
  const rapport = nouveauRapport();

  const existants = await tx.select({ email: contact.email, telephone: contact.telephone }).from(contact).where(eq(contact.entrepriseId, entrepriseId));
  const emailsVus = new Set(existants.map((c) => (c.email ?? "").toLowerCase()).filter(Boolean));
  const telephonesVus = new Set(existants.map((c) => chiffresTelephone(c.telephone)).filter(Boolean));

  type Prepare = { numero: number; nom: string; societe: string; niu: string; email: string | null; telephone: string; fonction: string | null; notes: string | null; assigneAId: string };
  const aCreer: Prepare[] = [];
  let sansTelephone = 0;
  let emailsInvalides = 0;

  for (const { numero, v } of lignes) {
    const societe = (v.entreprise ?? "").trim();
    const nom = [v.prenom, v.nom].map((s) => (s ?? "").trim()).filter(Boolean).join(" ") || societe;
    if (nom.length < 2) {
      erreur(rapport, numero, "Nom manquant ou trop court.");
      continue;
    }
    let email: string | null = (v.email ?? "").trim().toLowerCase() || null;
    if (email && !EMAIL_VALIDE.test(email)) {
      emailsInvalides++;
      email = null;
    }
    const telBrut = (v.telephone ?? "").trim();
    const tel = chiffresTelephone(telBrut);

    if ((email && emailsVus.has(email)) || (tel && telephonesVus.has(tel))) {
      rapport.ignores++; // déjà dans l'application, ou déjà vu plus haut dans ce fichier
      continue;
    }
    if (email) emailsVus.add(email);
    if (tel) telephonesVus.add(tel);
    if (!telBrut) sansTelephone++;

    aCreer.push({
      numero,
      nom,
      societe,
      niu: (v.niu ?? "").trim(),
      email,
      telephone: telBrut || TELEPHONE_ABSENT,
      fonction: (v.fonction ?? "").trim() || null,
      notes: (v.notes ?? "").trim() || null,
      // Le « responsable » du fichier est un email ou un nom : dans les deux cas, retrouvé dans l'équipe ou remplacé par vous.
      assigneAId: resoudreResponsable(ctx, emailResponsable(v.proprietaire), emailResponsable(v.proprietaire) ? undefined : v.proprietaire),
    });
  }

  // Sociétés : celles qui existent déjà sont réutilisées (comparées sans accents ni casse), les autres créées en lot.
  const comptes = await tx.select({ id: compteClient.id, nom: compteClient.nom }).from(compteClient).where(eq(compteClient.entrepriseId, entrepriseId));
  const compteParNom = new Map(comptes.map((c) => [normaliser(c.nom), c.id]));
  const nouvelles = new Map<string, { nom: string; niu: string | null }>();
  for (const c of aCreer) {
    const cle = normaliser(c.societe);
    if (!cle || compteParNom.has(cle) || nouvelles.has(cle)) continue;
    nouvelles.set(cle, { nom: c.societe, niu: c.niu || null });
  }
  for (const lot of lots([...nouvelles.entries()])) {
    const crees = await tx
      .insert(compteClient)
      .values(lot.map(([, s]) => ({ entrepriseId, nom: s.nom, niu: s.niu })))
      .returning({ id: compteClient.id, nom: compteClient.nom });
    for (const c of crees) compteParNom.set(normaliser(c.nom), c.id);
  }

  for (const lot of lots(aCreer)) {
    await tx.insert(contact).values(
      lot.map((c) => ({
        entrepriseId,
        compteId: compteParNom.get(normaliser(c.societe)) ?? null,
        nom: c.nom,
        telephone: c.telephone,
        email: c.email,
        fonction: c.fonction,
        notes: c.notes,
        assigneAId: c.assigneAId,
      }))
    );
  }
  rapport.crees = aCreer.length;

  compter(rapport, "Sociétés créées", nouvelles.size);
  if (sansTelephone > 0) avertir(rapport, 0, `${sansTelephone} contact(s) sans téléphone : « ${TELEPHONE_ABSENT} » a été inscrit, à compléter avant tout paiement en ligne.`);
  if (emailsInvalides > 0) avertir(rapport, 0, `${emailsInvalides} adresse(s) email invalide(s) ignorée(s).`);
  avertirResponsablesInconnus(ctx, rapport);
  return rapport;
}

function emailResponsable(valeur: string | undefined): string | undefined {
  const v = (valeur ?? "").trim();
  return v.includes("@") ? v : undefined;
}
