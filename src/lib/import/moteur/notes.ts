import { eq } from "drizzle-orm";
import { notePersonnelle } from "@/db/schema";
import { date } from "../valeurs";
import { erreur, nouveauRapport, type ContexteImport, type LigneImport, type Rapport } from "./commun";

const LONGUEUR_MAX_NOTE = 20_000;

/** Notes d'un autre outil : ajoutées à la suite du bloc-notes privé de la personne qui importe, chacune sous son titre. */
export async function importerNotes(ctx: ContexteImport, lignes: LigneImport[]): Promise<Rapport> {
  const { tx, entrepriseId, utilisateurId } = ctx;
  const rapport = nouveauRapport();

  // Le bloc-notes est strictement personnel : lecture et écriture filtrent sur l'importateur, jamais sur un identifiant reçu.
  const [existante] = await tx.select({ id: notePersonnelle.id, contenu: notePersonnelle.contenu }).from(notePersonnelle).where(eq(notePersonnelle.utilisateurId, utilisateurId));
  let contenu = existante?.contenu ?? "";

  for (const { numero, v } of lignes) {
    const corps = (v.contenu ?? "").trim();
    if (!corps) {
      erreur(rapport, numero, "Note vide.");
      continue;
    }
    const titre = (v.titre ?? "").trim();
    const quand = date(v.date);
    const entete = [titre || "Note importée", quand ? `(${quand.toISOString().slice(0, 10)})` : ""].filter(Boolean).join(" ");
    const bloc = `## ${entete}\n${corps}`;
    if (contenu.includes(bloc)) {
      rapport.ignores++; // déjà importée
      continue;
    }
    contenu = contenu ? `${contenu}\n\n${bloc}` : bloc;
    rapport.crees++;
  }

  if (contenu.length > LONGUEUR_MAX_NOTE * 5) {
    erreur(rapport, 0, "Le bloc-notes deviendrait trop long. Importez ces notes en plusieurs fois.");
    return rapport;
  }
  if (rapport.crees > 0) {
    if (existante) await tx.update(notePersonnelle).set({ contenu, misAJourLe: new Date() }).where(eq(notePersonnelle.id, existante.id));
    else await tx.insert(notePersonnelle).values({ entrepriseId, utilisateurId, contenu });
  }
  return rapport;
}
